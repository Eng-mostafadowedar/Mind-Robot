import RPi.GPIO as GPIO
import time

LED_PINS = [22, 5, 13]

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

for p in LED_PINS:
    GPIO.setup(p, GPIO.OUT)
    GPIO.output(p, GPIO.HIGH)  # يشتغلوا

print("3 LEDs ON")

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    for p in LED_PINS:
        GPIO.output(p, GPIO.LOW)  # يطفوا
    GPIO.cleanup()