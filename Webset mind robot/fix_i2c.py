import RPi.GPIO as GPIO
import time

GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)

print("Fixing GPIO 2 & 3...")
GPIO.setup(2, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.setup(3, GPIO.IN, pull_up_down=GPIO.PUD_UP)
time.sleep(0.5)

GPIO.setup(3, GPIO.OUT)
for _ in range(9):
    GPIO.output(3, 0)
    time.sleep(0.001)
    GPIO.output(3, 1)
    time.sleep(0.001)

GPIO.setup(3, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.cleanup()
print("✅ I2C Pins released!")
