import cv2
import pytesseract
from pytesseract import Output
from PIL import Image
import numpy as np
import requests
from io import BytesIO


def extract_text_from_url(image_url):
    # Download the image from URL
    response = requests.get(image_url)
    if response.status_code != 200:
        raise Exception(f"Failed to download image from URL: {response.status_code}")

    # Convert the image to a format OpenCV can process
    image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if image is None:
        raise Exception("Failed to decode image")

    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Extract text data
    d = pytesseract.image_to_data(gray, output_type=Output.DICT)

    extracted_text = []
    n_boxes = len(d["level"])
    for i in range(n_boxes):
        if int(d["conf"][i]) > 60:
            (x, y, w, h) = (d["left"][i], d["top"][i], d["width"][i], d["height"][i])
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 2)
            text = d["text"][i]
            extracted_text.append(text)
            print(f"Extracted text: {text}")

    # Display the image with bounding boxes
    cv2.imshow("Image with Bounding Boxes", image)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    return extracted_text


if __name__ == "__main__":
    # Example usage
    url = "https://tpc.googlesyndication.com/simgad/12568950865401688207"  # Replace with your image URL
    try:
        text = extract_text_from_url(url)
        print("\nAll extracted text:", text)
    except Exception as e:
        print(f"Error: {str(e)}")
