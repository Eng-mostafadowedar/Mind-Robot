import time
import json
import fcntl
import smbus2

DATA_FILE = "/home/mindrobot/Desktop/mindrobot/gsr_data.json"
I2C_BUS = 1
ADDR = 0x48

bus = None
last_gsr = 0
last_valid_time = 0

def init():
    global bus
    try:
        bus = smbus2.SMBus(I2C_BUS)
        print("[GSR] ✅ Started!")
        return True
    except Exception as e:
        print(f"[GSR] ❌ Init Error: {e}")
        return False

def main():
    global bus, last_gsr, last_valid_time
    if not init():
        with open(DATA_FILE, 'w') as f: 
            json.dump({"gsr": 0}, f)
        while True: 
            time.sleep(5)

    while True:
        try:
            # ✅ تأمين الـ I2C بالكامل أثناء الكتابة والقراءة معاً
            with open("/home/mindrobot/Desktop/mindrobot/i2c_lock.lck", "w") as lock_file:
                fcntl.flock(lock_file, fcntl.LOCK_EX)
                
                # إعداد الـ ADS1115 للقراءة من القناة A0 (Single-ended) وبـ Gain = 4.096V
                config = [0xC3, 0x85] 
                bus.write_i2c_block_data(ADDR, 0x01, config)
                
                # الـ ADS1115 بيحتاج وقت صغير جداً يعمل Conversion
                time.sleep(0.05) 
                
                # قراءة قيم الـ Conversion Register (A0)
                data = bus.read_i2c_block_data(ADDR, 0x00, 2)
                
            # تحويل البايتات لقيمة الـ ADC الخام
            gsr_raw = (data[0] << 8) | data[1]
            
            # التعامل مع الإشارة لو حصل Noise أو سالبة
            if gsr_raw > 32767: 
                gsr_raw = 0
                
            # تحويل القراءة لنسبة مئوية (0 لـ 100) تعبر عن التوصيل الكهربائي للجلد
            # الحساس في العادي لو محدش لامسه بيدي قيمة عالية (مقاومة عالية جداً)، ولما تلمسه القيمة بتقل
            if gsr_raw > 500:  # للتأكد إن فيه حساس متوصل وقاري
                # عمل Mapping بسيط من 0 لـ 100 لتبسيط عرض الداتا في الـ Dashboard
                gsr_val = round((gsr_raw / 32767.0) * 100, 1)
                
                last_valid_time = time.time()
                last_gsr = gsr_val
            else:
                # لو مفيش أي قراءة منطقية، انتظر 4 ثوانٍ قبل التصفير
                if time.time() - last_valid_time > 4: 
                    last_gsr = 0

            with open(DATA_FILE, 'w') as f:
                json.dump({"gsr": last_gsr}, f)
                
            print(f"[GSR] Value: {last_gsr}")
            time.sleep(1.5)
            
        except OSError as e:
            print(f"[GSR] I2C Error: {e}")
            time.sleep(2)
        except Exception as e:
            print(f"[GSR] Error: {e}")
            try: bus.close()
            except: pass
            time.sleep(2)
            init()

if __name__ == "__main__":
    main()
