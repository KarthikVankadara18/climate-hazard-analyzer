import os

from dotenv import load_dotenv
from pymongo import AsyncMongoClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE")

WEATHER_COLLECTION_NAME = os.getenv("WEATHER_COLLECTION_NAME")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is missing from .env")

if not MONGODB_DATABASE:
    raise RuntimeError("MONGODB_DATABASE is missing from .env")

if not WEATHER_COLLECTION_NAME:
    raise RuntimeError("WEATHER_COLLECTION_NAME is missing from .env")

client = AsyncMongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=5000,
)

database = client[MONGODB_DATABASE]
weather_collection = database[WEATHER_COLLECTION_NAME]


async def connect_to_database():
    await client.admin.command("ping")

    await weather_collection.create_index(
        [
            ("latitude", 1),
            ("longitude", 1),
            ("date", 1),
        ],
        unique=True,
        name="unique_location_date",
    )

    print("Connected to MongoDB.")


async def close_database_connection():
    await client.close()
    print("MongoDB connection closed.")
