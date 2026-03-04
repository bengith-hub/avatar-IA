from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    worker_token: str = ""
    hunyuan_model_path: str = "/root/avatar-data/models/hunyuan"
    fish_model_path: str = "/root/avatar-data/models/fish-audio"
    photos_path: str = "/root/avatar-data/photos"
    voice_path: str = "/root/avatar-data/voice"
    output_path: str = "/root/avatar-data/outputs"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
