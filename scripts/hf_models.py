from functools import lru_cache
from io import BytesIO
from typing import TypedDict, List

import requests
from PIL import Image, ImageDraw, ImageFont  # type: ignore[import-untyped]
from transformers import AutoProcessor, AutoModelForCausalLM  # type: ignore[import-untyped]


# Type definitions for better structure
class BoundingBox(TypedDict):
    top_left: tuple[float, float]
    top_right: tuple[float, float]
    bottom_right: tuple[float, float]
    bottom_left: tuple[float, float]
    center: tuple[float, float]
    width: float
    height: float


class TextRegion(TypedDict):
    text: str
    bounding_box: BoundingBox
    area: float
    aspect_ratio: float


@lru_cache(maxsize=1)
def load_florence_model() -> tuple[AutoModelForCausalLM, AutoProcessor]:
    model_id = "microsoft/Florence-2-large"
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
    return model, processor


def get_image_from_url(url: str) -> Image.Image:
    """Get image from URL and convert to RGB format.

    Args:
        url: URL of the image

    Returns:
        PIL Image in RGB format
    """
    response = requests.get(url)
    image = Image.open(BytesIO(response.content))
    # Convert to RGB if image is in a different mode (e.g., RGBA, L)
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image


def florence_model(image: Image.Image) -> dict:
    """Process image with Florence model for OCR.

    Args:
        image: PIL Image in RGB format

    Returns:
        Dictionary containing OCR results
    """
    model, processor = load_florence_model()

    # Ensure image is in RGB mode
    if image.mode != "RGB":
        image = image.convert("RGB")

    prompt = "<OCR_WITH_REGION>"
    inputs = processor(text=prompt, images=image, return_tensors="pt")
    generated_ids = model.generate(
        input_ids=inputs["input_ids"],
        pixel_values=inputs["pixel_values"],
        max_new_tokens=1024,
        num_beams=3,
    )
    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed_answer = processor.post_process_generation(
        generated_text, task=prompt, image_size=(image.width, image.height)
    )
    return parsed_answer


def parse_florence_result(result: dict) -> List[TextRegion]:
    """Parse Florence model OCR result into a structured format.

    Args:
        result: Dictionary output from Florence model

    Returns:
        List of TextRegion objects, each containing:
        - text: The detected text
        - bounding_box: Structured bounding box with coordinates and metadata
        - area: Area of the bounding box
        - aspect_ratio: Width/height ratio of the bounding box
    """
    ocr_data = result.get("<OCR_WITH_REGION>", {})
    quad_boxes = ocr_data.get("quad_boxes", [])
    labels = ocr_data.get("labels", [])

    # Remove any special tokens from labels
    labels = [label.replace("</s>", "").strip() for label in labels]

    text_regions: List[TextRegion] = []

    for box, label in zip(quad_boxes, labels):
        # Extract coordinates
        x1, y1, x2, y2, x3, y3, x4, y4 = box

        # Calculate center point
        center_x = sum([x1, x2, x3, x4]) / 4
        center_y = sum([y1, y2, y3, y4]) / 4

        # Calculate width and height
        width = max(abs(x2 - x1), abs(x4 - x3))
        height = max(abs(y3 - y1), abs(y4 - y2))

        # Create bounding box structure
        bounding_box: BoundingBox = {
            "top_left": (x1, y1),
            "top_right": (x2, y2),
            "bottom_right": (x3, y3),
            "bottom_left": (x4, y4),
            "center": (center_x, center_y),
            "width": width,
            "height": height,
        }

        # Calculate area and aspect ratio
        area = width * height
        aspect_ratio = width / height if height != 0 else 0

        # Create text region object
        text_region: TextRegion = {
            "text": label,
            "bounding_box": bounding_box,
            "area": area,
            "aspect_ratio": aspect_ratio,
        }

        text_regions.append(text_region)

    # Sort regions by vertical position (top to bottom)
    text_regions.sort(key=lambda x: x["bounding_box"]["top_left"][1])

    return text_regions


def draw_bounding_boxes(
    image: Image.Image, text_regions: List[TextRegion]
) -> Image.Image:
    """Draw bounding boxes and labels on the image.

    Args:
        image: PIL Image to draw on
        text_regions: List of TextRegion objects with bounding boxes and text

    Returns:
        PIL Image with bounding boxes and labels drawn
    """
    # Create a copy of the image to draw on
    draw_image = image.copy()
    draw = ImageDraw.Draw(draw_image)

    # Print image dimensions
    print(f"Image dimensions: {draw_image.width}x{draw_image.height}")

    # Try to load a font, fall back to default if not available
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    except IOError:
        font = ImageFont.load_default()

    # Colors for visualization
    box_color = (255, 0, 0)  # Red for boxes
    text_bg_color = (255, 255, 255)  # White background for text
    text_color = (255, 0, 0)  # Red text

    for region in text_regions:
        box = region["bounding_box"]

        # Draw the bounding box
        points = [
            box["top_left"],
            box["top_right"],
            box["bottom_right"],
            box["bottom_left"],
            box["top_left"],  # Close the polygon
        ]
        draw.line(points, fill=box_color, width=2)

        # Draw text above the box
        text = region["text"]
        text_x = box["top_left"][0]
        text_y = box["top_left"][1] - 20  # Position text above the box

        # Draw text background
        text_bbox = draw.textbbox((text_x, text_y), text, font=font)
        draw.rectangle(text_bbox, fill=text_bg_color)

        # Draw text
        draw.text((text_x, text_y), text, fill=text_color, font=font)

    return draw_image


if __name__ == "__main__":
    image_url = "https://tpc.googlesyndication.com/simgad/10725161807350920379"
    image = get_image_from_url(image_url)
    model_result = florence_model(image)
    parsed_result = parse_florence_result(model_result)

    # Draw bounding boxes on the image
    annotated_image = draw_bounding_boxes(image, parsed_result)

    # Show the annotated image in a window
    annotated_image.show()

    # Print results in a readable format
    print("\nDetected Text Regions:")
    print("-" * 50)
    for i, region in enumerate(parsed_result, 1):
        print(f"\nRegion {i}:")
        print(f"Text: {region['text']}")
        print(
            f"Center: ({region['bounding_box']['center'][0]:.1f}, {region['bounding_box']['center'][1]:.1f})"
        )
        print(
            f"Dimensions: {region['bounding_box']['width']:.1f}x{region['bounding_box']['height']:.1f}"
        )
        print(f"Area: {region['area']:.1f}")
        print(f"Aspect Ratio: {region['aspect_ratio']:.2f}")
