import time
import json
import fcntl
from DFRobot_BloodOxygen_S import DFRobot_BloodOxygen_S_i2c

DATA_FILE = "/home/mindrobot/Desktop/mindrobot/hr_data.json"
I2C_BUS = 1
ADDR = 0x57
max30102 = None
last_hr = 0
last_spo2 = 0
last_valid_time = 0

def init():
    global max30102
    try:
        max30102 = DFRobot_BloodOxygen_S_i2c(I2C_BUS, ADDR)
        retries = 0
        while not max30102.begin():
            print("HR Fail! Retrying...")
            retries += 1
            if retries > 3: 
                return False
            time.sleep(2)
        max30102.sensor_start_collect()
        print("HR Started!")
        return True
    except Exception as e:
        print(f"HR Error: {e}")
        return False

def get_hr_status(hr):
    if hr == 0: return "No Finger"
    elif hr < 60: return "Low (Bradycardia)"
    elif 60 <= hr <= 100: return "Normal"
    else: return "High (Tachycardia)"

def get_spo2_status(spo2):
    if spo2 == 0: return "No Finger"
    elif 95 <= spo2 <= 100: return "Normal"
    elif 90 <= spo2 < 95: return "Mild Hypoxia"
    else: return "Critical Low!"

def main():
    global last_hr, last_spo2, last_valid_time
    if not init():
        with open(DATA_FILE, "w") as f:
            json.dump({"hr": 0, "spo2": 0, "hr_status": "Error", "spo2_status": "Error"}, f)
        while True:
            time.sleep(5)

    while True:
        try:
            # قراءة الحساس باستخدام الـ I2C Lock لمنع التداخل
            with open("/home/mindrobot/Desktop/mindrobot/i2c_lock.lck", "w") as lock_file:
                fcntl.flock(lock_file, fcntl.LOCK_EX)
                max30102.get_heartbeat_SPO2()
                hr = max30102.heartbeat
                spo2 = max30102.SPO2

            # منطق الفلترة: لا نقبل القراءة إلا لو القيمتين معاً في المدى المنطقي
            if hr > 0 and spo2 > 0:
                if (40 <= hr <= 180) and (70 <= spo2 <= 100):
                    last_valid_time = time.time()
                    last_hr = hr
                    last_spo2 = spo2
            else:
                # الحفاظ على آخر قراءة صحيحة لمدة 4 ثوانٍ قبل التصفير لحين استقرار الإشارة
                if time.time() - last_valid_time > 4:
                    last_hr = 0
                    last_spo2 = 0

            # تحديد الحالات بناءً على آخر قراءة صحيحة مسجلة
            hr_status = get_hr_status(int(last_hr))
            spo2_status = get_spo2_status(int(last_spo2))

            # كتابة البيانات كاملة داخل ملف الـ JSON لـ FastAPI
            output_data = {
                "hr": int(last_hr), 
                "spo2": int(last_spo2),
                "hr_status": hr_status,
                "spo2_status": spo2_status
            }
            
            with open(DATA_FILE, "w") as f:
                json.dump(output_data, f)
                
            print(f"[HR] BPM: {int(last_hr)} ({hr_status}) | SpO2: {int(last_spo2)}% ({spo2_status})")
            time.sleep(1.0)

        except Exception as e:
            print(f"HR Error: {e}")
            time.sleep(1.0)

if __name__ == "__main__":
    main()
