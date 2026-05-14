import os
import math
import requests
from dotenv import load_dotenv

load_dotenv()

MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
MOCK_MODE = not MAPS_API_KEY or MAPS_API_KEY == "your_maps_api_key"

CITY_CENTERS = {
    "islamabad": {"lat": 33.6844, "lng": 73.0479},
    "lahore": {"lat": 31.5204, "lng": 74.3587},
    "karachi": {"lat": 24.8607, "lng": 67.0011},
}

AREA_COORDS = {
    # Islamabad
    "g-13": {"lat": 33.6844, "lng": 73.0479},
    "f-7": {"lat": 33.7294, "lng": 73.0537},
    "i-8": {"lat": 33.6641, "lng": 73.0781},
    "g-9": {"lat": 33.6994, "lng": 73.0500},
    "f-6": {"lat": 33.7344, "lng": 73.0681},
    "g-11": {"lat": 33.6994, "lng": 73.0281},
    "f-10": {"lat": 33.7194, "lng": 73.0281},
    "g-8": {"lat": 33.7044, "lng": 73.0660},
    "i-9": {"lat": 33.6541, "lng": 73.0781},
    "g-6": {"lat": 33.7244, "lng": 73.0779},
    # Lahore
    "dha lahore": {"lat": 31.4697, "lng": 74.4037},
    "gulberg": {"lat": 31.5163, "lng": 74.3521},
    "model town": {"lat": 31.4829, "lng": 74.3198},
    "johar town": {"lat": 31.4679, "lng": 74.2840},
    "bahria town lahore": {"lat": 31.3631, "lng": 74.1855},
    "garden town": {"lat": 31.5048, "lng": 74.3381},
    # Karachi
    "dha karachi": {"lat": 24.8134, "lng": 67.0697},
    "gulshan-e-iqbal": {"lat": 24.9197, "lng": 67.0913},
    "clifton": {"lat": 24.8280, "lng": 67.0328},
    "north nazimabad": {"lat": 24.9355, "lng": 67.0398},
    "saddar": {"lat": 24.8565, "lng": 67.0105},
    "pechs": {"lat": 24.8681, "lng": 67.0647},
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lng / 2) ** 2)
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)


def get_user_coordinates(location: str, city: str = "islamabad") -> dict:
    loc_lower = location.lower()

    for key, coords in AREA_COORDS.items():
        if key in loc_lower or loc_lower in key:
            return {**coords, "formatted_address": f"{location}, {city.title()}, Pakistan"}

    if not MOCK_MODE:
        try:
            url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {"address": f"{location}, {city}, Pakistan", "key": MAPS_API_KEY}
            resp = requests.get(url, params=params, timeout=5)
            data = resp.json()
            if data["status"] == "OK":
                loc = data["results"][0]["geometry"]["location"]
                return {
                    "lat": loc["lat"],
                    "lng": loc["lng"],
                    "formatted_address": data["results"][0]["formatted_address"],
                }
        except Exception as e:
            print(f"Maps API error: {e} — using city center fallback")

    center = CITY_CENTERS.get(city.lower(), CITY_CENTERS["islamabad"])
    return {**center, "formatted_address": f"{location}, {city.title()}, Pakistan"}


def calculate_eta_minutes(distance_km: float) -> int:
    speed_kmh = 30  # avg city speed in Pakistan
    return max(10, int((distance_km / speed_kmh) * 60) + 5)
