import sys
import cv2
import json
from fer import FER

def analyze_video(video_path):
    detector = FER(mtcnn=True)
    cap = cv2.VideoCapture(video_path)

    results = []
    frame_index = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        detections = detector.detect_emotions(frame)

        if detections:
            emotions = detections[0]["emotions"]
            results.append({
                "frame": frame_index,
                "emotions": emotions
            })

        frame_index += 1

    cap.release()
    return results

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python facial_model.py <video_path>")
        sys.exit(1)

    video_path = sys.argv[1]
    emotion_results = analyze_video(video_path)
    print(json.dumps(emotion_results))
