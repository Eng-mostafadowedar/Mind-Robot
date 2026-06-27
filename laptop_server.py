import cv2
import time
import os
import numpy as np
import psutil 
from datetime import datetime
from ultralytics import YOLO
from filterpy.kalman import KalmanFilter 

# ─── المكاتب الأساسية للربط والأمان وقاعدة البيانات ───
from tinydb import TinyDB, Query                         
from cryptography.fernet import Fernet                  
import paho.mqtt.client as mqtt                         

# ==========================================
# 📡 1. إعدادات الشبكة والربط اللاسلكي مع الراسبيري باي
# ==========================================
RASPBERRY_PI_IP = "192.168.1.10"  

# رابط استقبال بث الفيديو اللاسلكي من الراسبيري باي
server_address = f"tcp://{RASPBERRY_PI_IP}:5000"

# إعداد الـ MQTT لإرسال أوامر التحكم والـ PWM للراسبيري باي
MQTT_TOPIC_MOTOR = "robot/motor/control"
mqtt_client = mqtt.Client()
try:
    mqtt_client.connect(RASPBERRY_PI_IP, 1883, 60)
    mqtt_client.loop_start()
    print("📡 [NETWORK] MQTT Broker Connected to Raspberry Pi.")
except Exception as e:
    print("⚠️ [NETWORK] MQTT Connection failed (Running Server in Offline Mode).")

# ==========================================
# 🔐 2. إعداد نظام التشفير والأمان الطبي لحماية المريض
# ==========================================
encryption_key = Fernet.generate_key()
cipher_suite = Fernet(encryption_key)
db = TinyDB('mind_bot_secure_medical_db.json')

# ==========================================
# 📊 3. إعداد الـ Kalman Filter لتنعيم مسار الحركة لمنع الرعشة
# ==========================================
kf = KalmanFilter(dim_x=2, dim_z=2)
kf.x = np.array([0., 0.]) 
kf.F = np.eye(2)          
kf.H = np.eye(2)          
kf.R *= 12                
kf.P *= 1000.             

# ==========================================
# ⚙️ 4. كلاس الـ PID Controller لحساب سرعة المواتير (PWM)
# ==========================================
class PID:
    def __init__(self, kp, ki, kd, setpoint=0):
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.setpoint = setpoint
        self.last_error = 0
        self.integral = 0
        self.last_time = time.time()

    def compute(self, current_value):
        now = time.time()
        dt = now - self.last_time
        if dt == 0: dt = 1e-6
        
        error = self.setpoint - current_value
        p_term = self.kp * error
        self.integral += error * dt
        i_term = self.ki * self.integral
        derivative = (error - self.last_error) / dt
        d_term = self.kd * derivative
        
        self.last_error = error
        self.last_time = now
        return p_term + i_term + d_term

pid_tracking = PID(kp=0.85, ki=0.01, kd=0.12, setpoint=0)

# ==========================================
# ⏳ 5. إقلاع السيرفر وتجهيز الموديل الشامل لكل الأجسام
# ==========================================
print("\n🚀 [SERVER] Starting Mind Bot Network Center (Ultimate Mode)...")
cap = cv2.VideoCapture(server_address) 
model = YOLO('yolov8n-seg.pt') 

fps = 0
frame_counter = 0
start_time = time.time()
last_db_save_time = time.time()

# دالة الـ IoU المصححة لتجنب تضارب الـ numpy unpacking القديم
def calculate_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    
    denom = float(boxAArea + boxBArea - interArea)
    if denom == 0: return 0
    return interArea / denom

# ==========================================
# 🤖 6. الحلقة الرئيسية والمعالجة الشاملة (Live Omni Processing)
# ==========================================
window_name = "Mind Bot OS - Network Control Center"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)

while True:
    ret, frame = cap.read()
    if not ret or frame is None:
        time.sleep(0.01)
        continue
        
    frame_counter += 1
    h_f, w_f, _ = frame.shape
    screen_center_x = w_f // 2
    
    end_time = time.time()
    if end_time - start_time > 1.0:
        fps = frame_counter / (end_time - start_time)
        frame_counter = 0
        start_time = end_time

    persons_data = []
    resting_zones = [] 

    # البحث المفتوح: يلقط الـ 80 كلاس بتوع YOLO أوتوماتيك بدون قيود لتحديد أي مجسم
    results = model(frame, imgsz=320, conf=0.30, iou=0.45, verbose=False)
    mask_overlay = np.zeros_like(frame, dtype=np.uint8)

    for r in results:
        if r.masks is None or r.boxes is None: continue
        masks = r.masks.xy 
        boxes_xyxy = r.boxes.xyxy.cpu().numpy().astype(int)
        clss = r.boxes.cls.cpu().numpy().astype(int)
        confs = r.boxes.conf.cpu().numpy()

        for idx, seg_contour in enumerate(masks):
            if len(seg_contour) == 0: continue
            box = boxes_xyxy[idx]
            label = model.names[clss[idx]]
            contour_pts = np.array(seg_contour, dtype=np.int32)
            
            if label == 'person':
                persons_data.append({'box': box, 'contour': contour_pts, 'conf': confs[idx]})
            else:
                # حفظ الأثاث ومناطق الراحة لتشغيل منطق حساب السقوط والـ Overlap
                if label in ['bed', 'chair', 'couch']:
                    resting_zones.append({'box': box, 'contour': contour_pts, 'label': label})
                
                # تلوين وتحديد أي مجسم يظهر في الغرفة باللون الأزرق وكتابة اسمه ونسبة الثقة
                cv2.fillPoly(mask_overlay, [contour_pts], (255, 120, 0))
                cv2.putText(frame, f"{label.upper()} {confs[idx]*100:.0f}%", (box[0], max(15, box[1] - 6)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 120, 0), 1, cv2.LINE_AA)

    control_action = "MOTOR STATUS: POSITION LOCKED"
    raw_status = "No Patient Detected"

    if persons_data:
        for p in persons_data:
            bx1, by1, bx2, by2 = p['box']
            cx = int((bx1 + bx2) / 2)
            cy = int((by1 + by2) / 2)
            
            # تنعيم حركة تتبع المريض بالـ Kalman Filter
            kf.predict()
            kf.update(np.array([cx, cy]))
            smoothed_cx = int(kf.x[0])
            
            # ✨ [UI Cleaned] تم إزالة الخط الأصفر المزعج والدوائر المتعددة نهائياً
            # واستبدالهم بنقطة بينك واحدة بداخل مركز الهدف لتتبع راقي واحترافي
            cv2.circle(frame, (smoothed_cx, cy), 6, (255, 0, 255), -1) 

            # حساب قيم الـ PID وإرسال سرعة التحكم الـ PWM للراسبيري باي لاسلكياً
            current_error = screen_center_x - smoothed_cx
            motor_speed_output = pid_tracking.compute(current_error)
            
            if abs(current_error) > 25: 
                pwm_val = min(255, int(abs(motor_speed_output)))
                direction = "LEFT" if motor_speed_output > 0 else "RIGHT"
                control_action = f"MOTOR: TURN {direction} | PWM: {pwm_val}"
                
                try:
                    mqtt_client.publish(MQTT_TOPIC_MOTOR, f"{direction}:{pwm_val}")
                except:
                    pass
            else:
                control_action = "MOTOR: CENTERED"
                try:
                    mqtt_client.publish(MQTT_TOPIC_MOTOR, "HOLD:0")
                except:
                    pass

            # حساب وضعية المريض والسقوط الذكي والتداخل هندسياً مع الكراسي أو الأسرة
            w_box, h_box = (bx2 - bx1), (by2 - by1)
            aspect_ratio = w_box / h_box
            detected_pose = "Lying Down" if aspect_ratio > 1.35 else ("Sitting" if 0.6 < aspect_ratio <= 1.35 else "Standing")
            
            is_overlapping = False
            matched_zone_label = "zone"
            for zone in resting_zones:
                if calculate_iou(p['box'], zone['box']) > 0.12:
                    is_overlapping = True
                    matched_zone_label = zone['label']
                    break
            
            if detected_pose == "Lying Down" and is_overlapping:
                raw_status = f"Patient Resting Safe on {matched_zone_label.capitalize()}"
            elif detected_pose == "Lying Down" and not is_overlapping:
                raw_status = "CRITICAL FALL ALERT! 🚨"
            else:
                raw_status = f"Patient {detected_pose}"

            # تلوين المريض باللون الأخضر الشفاف المميز للمشروع
            cv2.fillPoly(mask_overlay, [p['contour']], (0, 255, 100))
            caption = f"PATIENT: {p['conf']*100:.1f}% | {raw_status}"
            cv2.putText(frame, caption, (bx1, max(15, by1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 100), 1, cv2.LINE_AA)

            # التشفير الطبي وبث البيانات وحفظها في قاعدة بيانات TinyDB المستقرة
            if time.time() - last_db_save_time > 5.0:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                log_data = f"Status: {raw_status} | Error: {current_error} | Action: {control_action}"
                
                encrypted_log = cipher_suite.encrypt(log_data.encode('utf-8'))
                db.insert({
                    'timestamp': timestamp,
                    'secure_payload': encrypted_log.decode('utf-8')
                })
                print(f"🔒 [DATABASE] Secure medical log injected at {timestamp}")
                last_db_save_time = time.time()

    cv2.addWeighted(mask_overlay, 0.25, frame, 0.75, 0, frame)

    # لوحة البيانات العلوية الشاملة (Telemetry Dashboard)
    cpu_usage = psutil.cpu_percent()
    cv2.rectangle(frame, (0, 0), (w_f, 55), (0, 0, 0), -1)
    telemetry_line1 = f"FPS: {fps:.1f} | CPU: {cpu_usage}% | Core Filters: All COCO Classes Active [Open-Vocab]"
    telemetry_line2 = f"Network Matrix -> {control_action}"
    
    cv2.putText(frame, telemetry_line1, (15, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, telemetry_line2, (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1, cv2.LINE_AA)

    cv2.imshow(window_name, frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()
try:
    mqtt_client.loop_stop()
    mqtt_client.disconnect()
except:
    pass