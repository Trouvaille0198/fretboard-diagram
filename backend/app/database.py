from pymongo import MongoClient, ASCENDING
from pymongo.database import Database
from app.config import settings

client: MongoClient = None
db: Database = None

def connect_to_mongo():
    global client, db
    client = MongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    # 创建索引
    db.users.create_index([("username", ASCENDING)], unique=True)
    db.users.create_index([("token", ASCENDING)], unique=True)
    db.directories.create_index([("username", ASCENDING)])
    db.states.create_index([("username", ASCENDING)])
    db.states.create_index([("username", ASCENDING), ("directory_id", ASCENDING)])
    
    print(f"Connected to MongoDB: {settings.MONGODB_URL}")

def close_mongo_connection():
    global client
    if client:
        client.close()
        print("MongoDB connection closed")

def get_database() -> Database:
    return db
