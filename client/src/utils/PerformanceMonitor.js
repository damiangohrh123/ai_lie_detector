class PerformanceMonitor {
  constructor(componentName) {
    this.componentName = componentName;
    this.metrics = {
      frameCount: 0,
      totalProcessingTime: 0,
      processingTimes: [],
      minTime: Infinity,
      maxTime: 0,
      successfulFrames: 0
    };
    this.isEnabled = true;
  }

  start() {
    if (!this.isEnabled) return;
    this.startTime = performance.now();
  }

  end(hasResult = true) {
    if (!this.isEnabled || !this.startTime) return;
    
    const processingTime = performance.now() - this.startTime;
    this.metrics.frameCount++;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.processingTimes.push(processingTime);
    this.metrics.processingTimes = this.metrics.processingTimes.slice(-10); // Keep last 10
    this.metrics.minTime = Math.min(this.metrics.minTime, processingTime);
    this.metrics.maxTime = Math.max(this.metrics.maxTime, processingTime);
    if (hasResult) {
      this.metrics.successfulFrames++;
    }
    
    // Log based on frame count and result
    if (hasResult && this.metrics.frameCount % 5 === 0) {
      const avgProcessingTime = this.metrics.totalProcessingTime / this.metrics.frameCount;
      console.log(`${this.componentName} Frame ${this.metrics.frameCount}: ${processingTime.toFixed(0)}ms (avg: ${avgProcessingTime.toFixed(0)}ms)`);
    } else if (!hasResult && this.metrics.frameCount % 50 === 0) {
      console.log(`${this.componentName} Frame ${this.metrics.frameCount}: No result detected (${processingTime.toFixed(0)}ms)`);
    }
    
    // Log stats every 50 frames with detection rate
    if (this.metrics.processingTimes.length > 0 && this.metrics.processingTimes.length % 50 === 0) {
      const avg = this.metrics.processingTimes.reduce((sum, time) => sum + time, 0) / this.metrics.processingTimes.length;
      const min = Math.min(...this.metrics.processingTimes);
      const max = Math.max(...this.metrics.processingTimes);
      const detectionRate = (this.metrics.successfulFrames / this.metrics.frameCount * 100).toFixed(1);
      console.log(`${this.componentName} Stats (${this.metrics.processingTimes.length} frames): avg=${avg.toFixed(0)}ms, min=${min.toFixed(0)}ms, max=${max.toFixed(0)}ms, detection_rate=${detectionRate}%`);
    }
  }

  getStats() {
    const { frameCount, totalProcessingTime, processingTimes, minTime, maxTime, successfulFrames } = this.metrics;
    return {
      frameCount,
      avgTime: frameCount > 0 ? totalProcessingTime / frameCount : 0,
      minTime: minTime === Infinity ? 0 : minTime,
      maxTime,
      recentAvg: processingTimes.length > 0 ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length : 0,
      detectionRate: frameCount > 0 ? (successfulFrames / frameCount * 100).toFixed(1) : '0.0'
    };
  }

  logStats() {
    const stats = this.getStats();
    console.log(`${this.componentName} Final Stats:`, stats);
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  reset() {
    this.metrics = {
      frameCount: 0,
      totalProcessingTime: 0,
      processingTimes: [],
      minTime: Infinity,
      maxTime: 0,
      successfulFrames: 0
    };
  }
}

export default PerformanceMonitor;
