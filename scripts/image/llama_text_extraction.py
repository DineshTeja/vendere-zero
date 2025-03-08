import openai
import os
import dotenv
from pydantic import BaseModel
import cv2
import numpy as np
import requests
from io import BytesIO
from PIL import Image


class Text(BaseModel):
    text: str
    top_left_x_percentage: int
    top_left_y_percentage: int
    bottom_right_x_percentage: int
    bottom_right_y_percentage: int


class TextExtractionResponse(BaseModel):
    text_elements: list[Text]


def download_image(url: str) -> np.ndarray:
    """Download image from URL and convert to OpenCV format."""
    response = requests.get(url)
    img = Image.open(BytesIO(response.content))
    # Convert PIL image to OpenCV format (BGR)
    opencv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    return opencv_img


def draw_bounding_boxes(image: np.ndarray, text_elements: list[Text]) -> np.ndarray:
    """Draw bounding boxes around detected text elements."""
    height, width = image.shape[:2]
    result = image.copy()

    # Define colors and text parameters
    box_color = (0, 255, 0)  # Green in BGR
    text_color = (255, 255, 255)  # White in BGR
    thickness = 2
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.5

    for text_elem in text_elements:
        print(text_elem)
        # Convert percentage coordinates to pixel coordinates
        x1 = int((text_elem.top_left_x_percentage / 100) * width)
        y1 = int((text_elem.top_left_y_percentage / 100) * height)
        x2 = int((text_elem.bottom_right_x_percentage / 100) * width)
        y2 = int((text_elem.bottom_right_y_percentage / 100) * height)

        # Draw rectangle
        cv2.rectangle(result, (x1, y1), (x2, y2), box_color, thickness)

        # Add text above the box
        text_position = (
            x1,
            max(y1 - 10, 20),
        )  # Place text above box, with minimum y of 20
        cv2.putText(
            result,
            text_elem.text,
            text_position,
            font,
            font_scale,
            text_color,
            thickness,
        )

    return result


dotenv.load_dotenv("../../.env.local")
openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

image_url = "https://tpc.googlesyndication.com/simgad/12568950865401688207"

# Download the image
original_image = download_image(image_url)

# Get text and bounding boxes from Llama
completion = openai_client.beta.chat.completions.parse(
    model="gpt-4o-mini",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Detect and extract all textual content from the image, returning both the recognized text and the corresponding top left and bottom right bounding box coordinates in percentage of the image size. Ensure high accuracy in capturing text embedded in complex backgrounds or varying font styles.",
                },
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }
    ],
    response_format=TextExtractionResponse,
)

# Get the text elements from the response
text_elements = completion.choices[0].message.parsed.text_elements

# Draw bounding boxes on the image
result_image = draw_bounding_boxes(original_image, text_elements)

# Save the result
output_path = "output_with_boxes.jpg"
cv2.imwrite(output_path, result_image)

print(f"Original text elements: {text_elements}")
print(f"Image with bounding boxes saved to: {output_path}")
