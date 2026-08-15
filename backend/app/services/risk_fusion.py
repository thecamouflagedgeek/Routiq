"""RoadSafe AI — contextual risk fusion.

Combines:
    ROAD RISK + DRIVER RISK
                ↓
        CONTEXTUAL RISK
                ↓
           INTERVENTION

Road risk comes from the existing SafetyEngine safety score.
Driver risk comes from the existing Sleep Drive fatigue state.

All calculations are deterministic so the hackathon demo is
repeatable and does not depend on external AI/model output.
"""

from __future__ import annotations

from app.config import RISK_LEVELS


# --------------------------------------------------------------------------
# Risk scoring
# --------------------------------------------------------------------------

def road_risk_score(safety_score: float) -> float:
    """
    Convert the existing RoadSafe safety score into a risk score.

    Existing safety convention:
        100 = safest
        0   = most dangerous

    Fusion convention:
        0   = lowest risk
        100 = highest risk
    """

    safety = max(0.0, min(100.0, safety_score))

    return round(100.0 - safety, 1)


def driver_risk_score(
    fatigue_confidence: float,
    escalation_level: int,
) -> float:
    """
    Convert Sleep Drive state into a normalized driver-risk score.

    fatigue_confidence:
        0–100 confidence signal from the existing fatigue engine.

    escalation_level:
        0 = normal
        1 = mild concern
        2 = elevated concern
        3 = critical concern

    The escalation level provides a safety floor so that a high
    escalation state cannot accidentally appear as low risk.
    """

    confidence = max(
        0.0,
        min(100.0, fatigue_confidence),
    )

    escalation_floor = {
        0: 0.0,
        1: 30.0,
        2: 60.0,
        3: 85.0,
    }.get(escalation_level, 0.0)

    return round(
        max(confidence, escalation_floor),
        1,
    )


# --------------------------------------------------------------------------
# Risk levels
# --------------------------------------------------------------------------

def contextual_level_for_component(risk_score: float) -> str:
    """
    Convert a risk score into a human-readable risk level.

    Higher score = higher danger.

    Contextual/component thresholds:

        0–24   SAFE
        25–49  MODERATE
        50–74  HIGH
        75–100 CRITICAL
    """

    risk = max(
        0.0,
        min(100.0, risk_score),
    )

    if risk < 25:
        return "SAFE"

    if risk < 50:
        return "MODERATE"

    if risk < 75:
        return "HIGH"

    return "CRITICAL"


# --------------------------------------------------------------------------
# Risk fusion
# --------------------------------------------------------------------------

def fuse_risk(
    road_risk: float,
    driver_risk: float,
) -> dict:
    """
    Combine road risk and driver risk into contextual risk.

    Weighting:
        60% road risk
        40% driver risk

    Contextual amplification:
        When both the road and driver are significantly risky,
        an additional penalty is applied because the combination
        creates a more dangerous situation than either factor alone.
    """

    road_risk = max(
        0.0,
        min(100.0, road_risk),
    )

    driver_risk = max(
        0.0,
        min(100.0, driver_risk),
    )

    # Primary fusion.
    score = (
        road_risk * 0.60
        + driver_risk * 0.40
    )

    # Contextual amplification.
    #
    # A road risk of 50+ represents a substantially risky road
    # condition, while driver risk of 60+ represents significant
    # fatigue/engagement concern.
    #
    # When both happen together, increase contextual risk.
    if road_risk >= 50 and driver_risk >= 60:
        score += 10

    score = round(
        min(100.0, score),
        1,
    )

    level = contextual_level_for_component(score)

    return {
        "score": score,
        "level": level,
        "color": RISK_LEVELS[level]["color"],
    }


# --------------------------------------------------------------------------
# Intervention
# --------------------------------------------------------------------------

def get_intervention(
    contextual_risk: float,
    road_risk: float,
    driver_risk: float,
) -> dict:
    """
    Generate a deterministic intervention based on contextual risk.

    The intervention is based on the combined state rather than
    simply reacting to road risk or driver risk independently.
    """

    # Critical contextual situation:
    # dangerous road + significant driver concern.
    if contextual_risk >= 75:
        return {
            "required": True,
            "type": "BREAK_RECOMMENDATION",
            "message": (
                "You're approaching a high-risk road segment and "
                "your driver engagement is decreasing. "
                "Consider taking a break."
            ),
        }

    # Elevated situation:
    # system should alert the driver but does not yet require
    # a strong break recommendation.
    if contextual_risk >= 55:
        return {
            "required": True,
            "type": "CAUTION",
            "message": (
                "Risk is elevated. Stay alert and "
                "consider slowing down."
            ),
        }

    # No intervention required.
    return {
        "required": False,
        "type": "NONE",
        "message": "No intervention required.",
    }


# --------------------------------------------------------------------------
# Local deterministic test
# --------------------------------------------------------------------------

if __name__ == "__main__":
    print("\n=== TEST 1: Dangerous road + fatigued driver ===")

    road = road_risk_score(43)
    driver = driver_risk_score(85, 3)

    contextual = fuse_risk(
        road,
        driver,
    )

    intervention = get_intervention(
        contextual["score"],
        road,
        driver,
    )

    print("Road risk:", road)
    print("Driver risk:", driver)
    print("Contextual risk:", contextual)
    print("Intervention:", intervention)

    print("\n=== TEST 2: Same road + alert driver ===")

    road = road_risk_score(43)
    driver = driver_risk_score(10, 0)

    contextual = fuse_risk(
        road,
        driver,
    )

    intervention = get_intervention(
        contextual["score"],
        road,
        driver,
    )

    print("Road risk:", road)
    print("Driver risk:", driver)
    print("Contextual risk:", contextual)
    print("Intervention:", intervention)