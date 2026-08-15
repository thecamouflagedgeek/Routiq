#!/usr/bin/env python3
"""Quick performance test for emergency navigation optimization.

Run this to verify the OSRM /table endpoint is faster than sequential /route calls.
This is a local test that doesn't require the full app to be running.
"""
import asyncio
import time

from app.providers.base import Point
from app.providers.routing import OsrmRoutingProvider


async def test_sequential_vs_batch():
    """Compare OLD sequential approach vs NEW batch approach."""
    
    # Mumbai coordinates (driver location)
    driver = (19.0760, 72.8777)
    
    # Simulated hospital candidates (12 hospitals around Mumbai)
    hospitals = [
        (19.0596, 72.8295),
        (19.1136, 72.9089),
        (19.0330, 72.8453),
        (19.0896, 72.8656),
        (19.0176, 72.8561),
        (19.1258, 72.8357),
        (19.0451, 72.9124),
        (19.0989, 72.8803),
        (18.9894, 72.8320),
        (19.1567, 72.8512),
        (19.0234, 72.8891),
        (19.0712, 72.8456),
    ]
    
    osrm = OsrmRoutingProvider()
    
    print("=" * 60)
    print("Emergency Navigation Performance Test")
    print("=" * 60)
    print(f"Driver location: {driver}")
    print(f"Hospital candidates: {len(hospitals)}")
    print()
    
    # OLD WAY: Sequential /route calls (simulating the old code)
    print("🐌 OLD: Sequential /route calls (one per hospital)...")
    start = time.time()
    old_etas = []
    for hospital in hospitals:
        eta = await osrm.duration(driver, hospital)
        old_etas.append(eta)
    old_time = time.time() - start
    print(f"   ✓ Completed in {old_time:.2f} seconds")
    print(f"   ✓ Valid ETAs: {sum(1 for eta in old_etas if eta is not None)}/{len(hospitals)}")
    print()
    
    # NEW WAY: Single /table call
    print("⚡ NEW: Single OSRM /table (matrix) call...")
    start = time.time()
    new_etas = await osrm.durations_matrix(driver, hospitals)
    new_time = time.time() - start
    print(f"   ✓ Completed in {new_time:.2f} seconds")
    print(f"   ✓ Valid ETAs: {sum(1 for eta in new_etas if eta is not None)}/{len(hospitals)}")
    print()
    
    # Results
    speedup = old_time / new_time if new_time > 0 else 0
    improvement = ((old_time - new_time) / old_time * 100) if old_time > 0 else 0
    
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Old approach: {old_time:.2f}s ({len(hospitals)} separate requests)")
    print(f"New approach: {new_time:.2f}s (1 batch request)")
    print(f"Speedup: {speedup:.1f}x faster")
    print(f"Improvement: {improvement:.1f}% reduction in time")
    print()
    
    if speedup >= 5:
        print("✅ EXCELLENT: 5x+ speedup achieved!")
    elif speedup >= 3:
        print("✅ GOOD: 3-5x speedup achieved")
    elif speedup >= 2:
        print("⚠️  OK: 2-3x speedup (network may be slow)")
    else:
        print("❌ PROBLEM: Speedup less than 2x (check network/OSRM)")
    print()
    
    # Verify correctness: both methods should return similar ETAs
    print("Validating correctness...")
    mismatches = 0
    for i, (old_eta, new_eta) in enumerate(zip(old_etas, new_etas)):
        if old_eta is None and new_eta is None:
            continue  # both failed, that's fine
        if old_eta is None or new_eta is None:
            mismatches += 1
            print(f"   ⚠️  Hospital {i}: old={old_eta}, new={new_eta}")
        elif abs(old_eta - new_eta) > 0.5:  # allow 0.5 min difference (rounding)
            mismatches += 1
            print(f"   ⚠️  Hospital {i}: old={old_eta:.1f}, new={new_eta:.1f}")
    
    if mismatches == 0:
        print("✅ All ETAs match (both methods produce same results)")
    else:
        print(f"⚠️  {mismatches}/{len(hospitals)} ETAs differ (may be network timing)")
    print()


if __name__ == "__main__":
    print("\nTesting Emergency Navigation Performance Fix...")
    print("This will make real requests to public OSRM servers.\n")
    
    try:
        asyncio.run(test_sequential_vs_batch())
    except KeyboardInterrupt:
        print("\n❌ Test interrupted")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise
