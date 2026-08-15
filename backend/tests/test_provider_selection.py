import os

from app.config import Settings
from app.models import TranscribeResponse, TTSResponse


def test_provider_selection_defaults_to_elevenlabs_for_tts():
    settings = Settings()
    assert settings.stt_provider == 'sarvam'
    assert settings.tts_provider == 'elevenlabs'


def test_speech_responses_expose_provider_metadata():
    transcribe = TranscribeResponse(
        transcript='namaste',
        language_code='hi-IN',
        provider='sarvam',
        fallback=False,
    )
    assert transcribe.provider == 'sarvam'
    assert transcribe.fallback is False

    tts = TTSResponse(
        audio_base64='abc',
        format='mp3',
        source='elevenlabs',
        provider='elevenlabs',
        fallback=False,
    )
    assert tts.provider == 'elevenlabs'
    assert tts.fallback is False
