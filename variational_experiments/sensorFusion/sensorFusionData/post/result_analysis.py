import numpy as np
import pandas as pd
from matplotlib import pyplot as plt

filename = ['unguided.csv', 'guidedsensorFusionArch.csv', 'guidedsensorFusionArchWithPrevX.csv']

tables = [pd.read_csv(fn) for fn in filename]
numParticles = [np.array(t['numParticles']) for t in tables]
post = [np.array(t['logpost']) for t in tables]
time = [np.array(t['timeUsed']) for t in tables]

start=9
end=-1

plt.clf()
plt.title('log(posterior) vs numParticles')
plt.plot(numParticles[0][start:end], post[0][start:end], label='unguided')
plt.plot(numParticles[1][start:end], post[1][start:end], label='guidedArch1')
plt.plot(numParticles[2][start:end], post[2][start:end], label='guidedArch2')
plt.legend(loc='lower right')
plt.xlabel('numParticles')
plt.ylabel('log(posterior)')
plt.savefig('posterior.pdf')

plt.clf()
plt.title('time/(100samples*ms) vs numParticles')
plt.plot(numParticles[0][start:end], time[0][start:end], label='unguided')
plt.plot(numParticles[1][start:end], time[1][start:end], label='guidedArch1')
plt.plot(numParticles[2][start:end], time[2][start:end], label='guidedArch2')
plt.xlabel('numParticles')
plt.ylabel('time/(100samples*ms)')
plt.legend(loc='upper left')
plt.savefig('time.pdf')



filename = ['sensorFusionArch_diagnostics.csv', 'sensorFusionArchWithPrevX_diagnostics.csv']

def smooth(x, y, half_window):
	window = 2 * half_window
	new_idx = np.linspace(half_window, len(x)-1, window, dtype=int)
	xnew = x[new_idx]
	ynew = [np.mean(y[(idx-half_window):(idx+half_window)]) for idx in new_idx]
	return xnew, ynew

tables = [pd.read_csv(fn) for fn in filename]
iteration = [np.array(t['iteration']) for t in tables]
guideScore = [np.array(t['guideScore']) for t in tables]
targetScore = [np.array(t['targetScore']) for t in tables]
totalTime = [np.array(t['totalTime']) for t in tables]

plt.clf()
plt.title('totalTime vs Score (number of iterations: 10000)')

start, end = 0, 10000

xnew, ynew = smooth(totalTime[0][start:end], guideScore[0][start:end], 100)
plt.plot(xnew, ynew, label='guide score arch1')

xnew, ynew = smooth(totalTime[0][start:end], targetScore[0][start:end], 100)
plt.plot(xnew, ynew, label='target score of arch1')

xnew, ynew = smooth(totalTime[1][start:end], guideScore[1][start:end], 100)
plt.plot(xnew, ynew, label='guide score of arch2')

xnew, ynew = smooth(totalTime[1][start:end], targetScore[1][start:end], 100)
plt.plot(xnew, ynew, label='target score of arch2')
plt.legend(loc='lower right')
plt.xlabel('totalTime/s')
plt.ylabel('Score')
plt.savefig('training.pdf')
