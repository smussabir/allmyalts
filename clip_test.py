from PIL import Image
import cv2
import numpy as np

# Load the image
img = Image.open('example.png')
img_array = np.array(img)

# Convert the image to grayscale
gray_img = img.convert('L')
gray_array = np.array(gray_img)

# Apply edge detection to the grayscale image
edges = cv2.Canny(gray_array, threshold1=30, threshold2=100)

# Find the contours of the edges
contours, hierarchy = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Get the bounding box of all contours
boxes = [cv2.boundingRect(contour) for contour in contours]

# Merge bounding boxes that overlap or are close to each other
merged_boxes = []
for box in boxes:
    if not merged_boxes:
        merged_boxes.append(box)
    else:
        last_box = merged_boxes[-1]
        if box[0] + box[2] < last_box[0] or box[1] + box[3] < last_box[1]:
            merged_boxes.append(box)
        else:
            merged_boxes[-1] = (min(last_box[0], box[0]), min(last_box[1], box[1]),
                                max(last_box[0]+last_box[2], box[0]+box[2]) - min(last_box[0], box[0]),
                                max(last_box[1]+last_box[3], box[1]+box[3]) - min(last_box[1], box[1]))

# Get the bounding box of the merged boxes
if merged_boxes:
    points = [tuple(point) for box in merged_boxes for point in [(box[0], box[1]), (box[0] + box[2], box[1] + box[3])]]
    x, y, w, h = cv2.boundingRect(np.array(points))
else:
    x, y, w, h = 0, 0, img.width, img.height

region = (x, y, x+w, y+h)

# Clip the original image
clipped_img = img.crop(region)

# Save the clipped image
clipped_img.save('clipped.png')
