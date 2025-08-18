import requests
import time

# API endpoint
API_URL = "http://localhost:8000/api/text-sentiment"

# Test cases with ground truth labels
test_cases = [
    # Factual statements
    {"text": "Africa is a continent", "ground_truth": "truthful"},
    {"text": "The sky is blue.", "ground_truth": "truthful"},
    {"text": "Your heart pumps blood through your body.", "ground_truth": "truthful"},
    {"text": "My name is Damian.", "ground_truth": "truthful"},
    {"text": "I am 25 years old.", "ground_truth": "truthful"},
    {"text": "I was born in Singapore.", "ground_truth": "truthful"},
    {"text": "I am sitting at my desk.", "ground_truth": "truthful"},
    {"text": "It is morning right now.", "ground_truth": "truthful"},
    {"text": "It is very sunny.", "ground_truth": "truthful"},
    {"text": "I had breakfast this morning.", "ground_truth": "truthful"},
    {"text": "I drank water just now.", "ground_truth": "truthful"},
    {"text": "I brushed my teeth when I woke up.", "ground_truth": "truthful"},
    
    # Deceptive statements 
    {"text": "I am 4 years old.", "ground_truth": "deceptive"},
    {"text": "Singapore is in China.", "ground_truth": "deceptive"},
    {"text": "I am living in the Pacific ocean.", "ground_truth": "deceptive"},
    {"text": "I read 50 books everyday.", "ground_truth": "deceptive"},
    {"text": "I run faster than a cheetah.", "ground_truth": "deceptive"},
    {"text": "I can fly.", "ground_truth": "deceptive"},
    {"text": "I was at the store.", "ground_truth": "truthful"},
    {"text": "I met a friend.", "ground_truth": "truthful"},
    {"text": "I did it.", "ground_truth": "truthful"},
    {"text": "I don't really remember.", "ground_truth": "deceptive"},
    {"text": "It's kind of complicated.", "ground_truth": "deceptive"},
    {"text": "I think so.", "ground_truth": "deceptive"}
]

def test_text_model():
    print("Testing Text Analysis Model")
    print(f"Total Test Cases: {len(test_cases)}")
    
    results = []
    
    for i, test_case in enumerate(test_cases, 1):
        text = test_case["text"]
        ground_truth = test_case["ground_truth"]
        
        try:
            # Send request and measure time
            start_time = time.time()
            response = requests.post(API_URL, json={"text": text})
            end_time = time.time()
            
            if response.status_code == 200:
                result = response.json()
                processing_time = (end_time - start_time) * 1000
                
                # Check prediction accuracy
                predicted_label = result.get('label', 'N/A')
                is_correct = predicted_label == ground_truth
                confidence = result.get('score', 0)
                
                # Simple output format
                status = "✅" if is_correct else "❌"
                print(f"{i:2d}. {status} '{text[:40]}{'...' if len(text) > 40 else ''}' | {predicted_label} ({confidence:.1%}) | {processing_time:.0f}ms")
                
                # Store results
                results.append({
                    'test_no': i,
                    'text': text,
                    'ground_truth': ground_truth,
                    'predicted_label': predicted_label,
                    'is_correct': is_correct,
                    'confidence': confidence,
                    'processing_time': processing_time,
                    'status': 'success'
                })
                
            else:
                print(f"{i:2d}. HTTP Error: {response.status_code}")
                results.append({
                    'test_no': i,
                    'text': text,
                    'ground_truth': ground_truth,
                    'predicted_label': 'ERROR',
                    'is_correct': False,
                    'confidence': 0,
                    'processing_time': 0,
                    'status': f'HTTP {response.status_code}',
                    'error': response.text
                })
                
        except requests.exceptions.ConnectionError:
            print(f" Connection Error: Cannot connect to {API_URL}")
            break
        except Exception as e:
            print(f"{i:2d}. Error: {e}")
            results.append({
                'test_no': i,
                'text': text,
                'ground_truth': ground_truth,
                'predicted_label': 'ERROR',
                'is_correct': False,
                'confidence': 0,
                'processing_time': 0,
                'status': 'exception',
                'error': str(e)
            })
    
    # Print summary
    print("SUMMARY")
    
    if results:
        successful_tests = [r for r in results if r['status'] == 'success']
        
        if successful_tests:
            # Calculate metrics
            correct_predictions = sum(1 for r in successful_tests if r['is_correct'])
            total_predictions = len(successful_tests)
            accuracy = (correct_predictions / total_predictions) * 100
            
            # Per-category accuracy
            truthful_tests = [r for r in successful_tests if r['ground_truth'] == 'truthful']
            deceptive_tests = [r for r in successful_tests if r['ground_truth'] == 'deceptive']
            
            truthful_accuracy = (sum(1 for r in truthful_tests if r['is_correct']) / len(truthful_tests) * 100) if truthful_tests else 0
            deceptive_accuracy = (sum(1 for r in deceptive_tests if r['is_correct']) / len(deceptive_tests) * 100) if deceptive_tests else 0
            
            # Performance
            avg_processing_time = sum(r['processing_time'] for r in successful_tests) / len(successful_tests)
            
            # Predictions
            truthful_count = sum(1 for r in successful_tests if r['predicted_label'] == 'truthful')
            deceptive_count = sum(1 for r in successful_tests if r['predicted_label'] == 'deceptive')
            
            print(f"Accuracy: {accuracy:.1f}% ({correct_predictions}/{total_predictions})")
            print(f"  Truthful: {truthful_accuracy:.1f}%")
            print(f"  Deceptive: {deceptive_accuracy:.1f}%")
            print(f"Predictions: {truthful_count} truthful, {deceptive_count} deceptive")
            print(f"Avg Processing Time: {avg_processing_time:.0f}ms")
        else:
            print("No successful tests to summarize")
    else:
        print("No test results to summarize")

if __name__ == "__main__":
    test_text_model()
