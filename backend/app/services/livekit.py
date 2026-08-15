from __future__ import annotations

from livekit.api import AccessToken, VideoGrants

from app.config import settings


class LiveKitSessionService:
    def create_token(self, identity: str, room_name: str | None = None) -> str:
        if not settings.has_livekit:
            raise ValueError("LiveKit is not configured")

        room = room_name or settings.livekit_room_name
        token = (
            AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
            .with_identity(identity)
            .with_name(identity)
            .with_grants(
                VideoGrants(
                    room_join=True,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                    room=room,
                )
            )
        )
        return token.to_jwt()


livekit_service = LiveKitSessionService()
