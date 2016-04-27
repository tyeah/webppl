###1. Generate training and test data
node sensorFusionData/runGenSFData.js --outputName testGen --numSamples 50
###2. Train
node ye_tasks/trainSensorFusion.js --measures trainingMeasures --trainingTraces trainingTraces5000 --numIters 20000 --arch sensorFusionArchWithPrevX --outputName sensorFusionArchWithPrevX
###3. Test
node ye_tasks/genSFTraces.js --measures testMeasures --numParticles 20 --numSamples 100 --verbose false --trainedModel sensorFusionArchWithPrevX
