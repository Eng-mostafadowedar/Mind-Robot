import time
import json
import fcntl
import smbus2

DATA_FILE = "/home/mindrobot/Desktop/mindrobot/temp_data.json"
I2C_BUS = 1
ADDR = 0x4B

bus = None
last_temp = 0
last_valid_time = 0
ambient_baseline = 30.0  # القيمة الابتدائية الافتراضية
baseline_samples = []

def init():
    global bus
    try:
        bus = smbus2.SMBus(I2C_BUS)
        bus.write_byte_data(ADDR, 0x01, 0x00)
        print("[TEMP] ✅ Started!")
        return True
    except Exception as e:
        print(f"[TEMP] ❌ Init Error: {e}")
        return False

def main():
    global bus, last_temp, last_valid_time, ambient_baseline
    if not init():
        with open(DATA_FILE, 'w') as f: 
            json.dump({"temp": 0}, f)
        while True: 
            time.sleep(5)

    while True:
        try:
            with open("/home/mindrobot/Desktop/mindrobot/i2c_lock.lck", "w") as lock_file:
                fcntl.flock(lock_file, fcntl.LOCK_EX)
                data = bus.read_i2c_block_data(ADDR, 0x00, 2)
                
            temp_raw = (data[0] << 8) | data[1]
            if temp_raw & 0x8000: 
                temp_raw = temp_raw - 0x10000
            skin_temp = temp_raw * 0.00390625
            
            # فلتر القراءات الخيالية
            if skin_temp > 50.0 or skin_temp < 10.0: 
                skin_temp = 0
            
            if skin_temp > 0:
                # ✅ تحديث حرارة الأوضة (حتى لو وصلت 32 في الصيف) طالما مفيش حد لامس الحساس
                if 15.0 < skin_temp <= 32.0 and len(baseline_samples) < 20:
                    # لو لسه بنجمع عينات في الأول ومحدش حاطط إيده
                    baseline_samples.append(skin_temp)
                    ambient_baseline = sum(baseline_samples) / len(baseline_samples)
                
                out_temp = 0
                # ✅ لو الحرارة زادت عن الأوضة بـ 0.8 درجة، يبقى فيه صباع أو جسم لمسه
                if skin_temp > (ambient_baseline + 0.8):
                    if skin_temp < 31.0: comp = 6.0
                    elif skin_temp < 33.0: comp = 4.5
                    elif skin_temp < 35.0: comp = 2.5
                    else: comp = 1.5
                    
                    out_temp = round(skin_temp + comp, 1)
                    if out_temp > 45.0: out_temp = 0
                    
                    last_valid_time = time.time()
                    last_temp = out_temp
                else:
                    # لو رجعت لحرارة الأوضة، استمر في عرض آخر قراءة لمدة 4 ثوانٍ ثم صفر
                    if time.time() - last_valid_time > 4: 
                        last_temp = 0
                        # لو الحرارة مستقرة تماماً، رجع حدث الـ baseline ببطء لضبط دقة الأوضة
                        if 15.0 < skin_temp <= 32.0:
                            baseline_samples.append(skin_temp)
                            if len(baseline_samples) > 20: baseline_samples.pop(0)
                            ambient_baseline = sum(baseline_samples) / len(baseline_samples)

            with open(DATA_FILE, 'w') as f:
                json.dump({"temp": last_temp}, f)
                
            print(f"[TEMP] Raw: {skin_temp:.2f} | Body: {last_temp} | Base: {ambient_baseline:.1f}")
            time.sleep(1.5)
            
        except OSError as e:
            print(f"[TEMP] I2C Error: {e}")
            time.sleep(2)
        except Exception as e:
            print(f"[TEMP] Error: {e}")
            try: bus.close()
            except: pass
            time.sleep(2)
            init()

if __name__ == "__main__":
    main()
