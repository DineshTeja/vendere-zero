from functools import lru_cache
from io import BytesIO
from typing import TypedDict, List

import requests
from PIL import Image
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


def florence_model(image: Image.Image) -> dict:
    model, processor = load_florence_model()
    prompt = "<OCR_WITH_REGION>"
    inputs = processor(text=prompt, images=image, return_tensors="pt")
    generated_ids = model.generate(
        input_ids=inputs["input_ids"],
        pixel_values=inputs["pixel_values"],
        max_new_tokens=1024,  # Increased from 100 to 1024 for more comprehensive output
        num_beams=3,
    )
    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed_answer = processor.post_process_generation(
        generated_text, task=prompt, image_size=(image.width, image.height)
    )
    return parsed_answer


def get_image_from_url(url: str) -> Image.Image:
    response = requests.get(url)
    image = Image.open(BytesIO(response.content))
    return image


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


if __name__ == "__main__":
    image_url = "https://tpc.googlesyndication.com/simgad/749086828097034900"
    image = get_image_from_url(image_url)
    model_result = florence_model(image)
    parsed_result = parse_florence_result(model_result)

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
