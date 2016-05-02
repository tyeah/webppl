#!/bin/python

from subprocess import check_output

#surfix = ' --trainedModel sensorFusionArch'
surfix = ' --trainedModel sensorFusionArch'
#surfix = ''
outputSurfix = surfix.split(' ')[-1]
outputName = 'sensorFusionData/post/realtime_stats_%s.csv' % outputSurfix

measureFile = 'sensorFusionData/testMeasuresRT.txt'
measureFilePrefix = measureFile.split('/')[-1].split('.')[0]
cmd = 'node ye_tasks/realTimeSF.js --numParticles %d%s --measures %s'
numSamples = 10

f = open(outputName, 'w')
f.write('numParticles,logpost,timeUsed\n')

times = []
logposts = []
maxNP = 1000
for numParticles in [10, 30, 50] + range(100, maxNP + 1, 100):
#for numParticles in [10, 30]:
  cmd0 = cmd % (numParticles, surfix, measureFilePrefix)
  time0 = 0.
  logpost0 = 0.
  for _ in range(numSamples):
    out = check_output(cmd0.split(' ')).split('\n')[:-1]
    logpost = float(out[0].split(': ')[-1])
    time = int(out[1].split(': ')[-1])
    time0 += time
    logpost0 += logpost
    print time, logpost
  #time0 = time0 / numSamples
  logpost0 = logpost0 / numSamples
  times.append(time0)
  logposts.append(logpost0)
  f.write('%d,%f,%f\n' % (numParticles, logpost0, time0))
f.close()

print times
print logposts
