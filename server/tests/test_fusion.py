import requests

# API endpoint
API_URL = "http://localhost:8000/api/fusion-truthfulness"

# Test scenarios for fusion system
test_scenarios = [
    {
        "name": "All Truthful",
        "input": {"face": [0.8, 0.2], "voice": [0.9, 0.1], "text": [0.7, 0.3]},
        "expected": 0.2
    },
    {
        "name": "All Deceptive", 
        "input": {"face": [0.2, 0.8], "voice": [0.1, 0.9], "text": [0.3, 0.7]},
        "expected": 0.8
    },
    {
        "name": "Mixed Signals",
        "input": {"face": [0.8, 0.2], "voice": [0.9, 0.1], "text": [0.2, 0.8]},
        "expected": 0.37
    },
    {
        "name": "Missing Face",
        "input": {"voice": [0.7, 0.3], "text": [0.6, 0.4]},
        "expected": 0.233
    },
    {
        "name": "Neutral Case",
        "input": {"face": [0.5, 0.5], "voice": [0.5, 0.5], "text": [0.5, 0.5]},
        "expected": 0.5
    }
]

def test_fusion():
    print("Testing Fusion System")
    print(f"Total Test Cases: {len(test_scenarios)}\n")
    
    passed = 0
    failed = 0
    
    for i, scenario in enumerate(test_scenarios, 1):
        name = scenario["name"]
        input_data = scenario["input"]
        expected = scenario["expected"]
        
        try:
            response = requests.post(API_URL, json=input_data, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                actual_score = result.get('score', 0)
                
                # Check if result matches expectation (within 0.01 tolerance)
                is_correct = abs(actual_score - expected) < 0.01
                
                if is_correct:
                    passed += 1
                    status = "✅"
                else:
                    failed += 1
                    status = "❌"
                
                print(f"{i}. {status} {name}")
                print(f"    Expected: {expected:.3f}, Actual: {actual_score:.3f}")
                print()
                
            else:
                failed += 1
                print(f"{i}. ❌ {name} - HTTP Error: {response.status_code}\n")
                
        except Exception as e:
            failed += 1
            print(f"{i}. ❌ {name} - Error: {e}\n")
    
    # Summary
    print("SUMMARY")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Success Rate: {(passed/(passed+failed)*100):.1f}%")

if __name__ == "__main__":
    test_fusion()
