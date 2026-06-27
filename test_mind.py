import cv2
from ultralytics import YOLO

print("🔄 Loading YOLOv8 Model...")
# استخدام الموديل النانو
model = YOLO("yolov8n.pt")
print("✅ AI Model Loaded!")

server_address = "tcp://127.0.0.1:5000"
cap = cv2.VideoCapture(server_address)

# تقليل الـ Buffer لأقصى درجة
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

window_name = "Medical Robot AI - Smooth Video"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
cv2.resizeWindow(window_name, 640, 480) # حجم العرض المناسب لشاشة الـ Pi

print("🚀 Smooth Stream is Active...")

frame_count = 0
annotated_frame = None

while True:
    ret, frame = cap.read()
    if not ret or frame is None:
        continue

    frame_count += 1

    # 🏎️ كل 4 فريمات بنخلي الـ YOLO يفكر مرة، عشان نريح الـ CPU 100%
    if frame_count % 4 == 0:
        # صغرنا حجم صورة الاستدلال لـ 128 لتسريع الـ Inference لأقصى حد
        results = model(frame, stream=True, imgsz=128, conf=0.45, verbose=False)
        for r in results:
            annotated_frame = r.plot()

    # 🎯 تكة الفيديو المستمر: 
    # لو الـ AI لسه بيفكر، اعرض الفريم العادي الحي عشان الحركة تفضل ناعمة ومستمرة
    if annotated_frame is not None:
        cv2.imshow(window_name, annotated_frame)
    else:
        cv2.imshow(window_name, frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("🏁 System Closed.")