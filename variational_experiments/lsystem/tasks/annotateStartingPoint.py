from __future__ import division 
import matplotlib.pyplot as plt
import os
import sys 
import argparse 
import math

"""
Displays each image in targets/source, records coordinates of two consecutive mouseclicks, 
saves normalized coordinates and unit direction for each image file to targets/source/file.txt.
Close window to advance to the next image. 

"Restart" annotation by selecting two new points.
Total number of clicks must be even - the final pair will be written to file.

Usage: annotateStarting.py --file [file] --startX [startX] --startY [startY]. If file is given then 
only file will be annotated, otherwise will loop through all images in targets/source. 

If startX and startY are given then text files for all images (or, if --file is specified, only one image)
will be generated with the same starting point, without manual annotation. 

"""
source_dir = '../targets/source/'
ext = '.png'

filelist = []

parser = argparse.ArgumentParser()
parser.add_argument('--file')
parser.add_argument('--startX')
parser.add_argument('--startY')
args = parser.parse_args()

if args.file:
	filelist.append(args.file)

else:
	filelist = os.listdir(source_dir)

print filelist 

#Iterate through images in directory 
for file in filelist:
	if file.endswith(ext): 
		if args.startX and args.startY:
			coord_file = open(source_dir + file[:-4] + '.txt', 'w')
			coord_file.write(str(args.startX) + " " + str(args.startY))
	
		else:
			print file 
			im = plt.imread(source_dir + file)
			width = im.shape[0]
			height = im.shape[1] 
			ax = plt.gca()
			fig = plt.gcf()
			implot = ax.imshow(im)
			pt1 = [0,0]
			pt2 = [0,0]
			dir = [0,0]
			annotated = False
			numclicks = 0

			def onclick(event):
				global annotated
				global numclicks
				if event.xdata != None and event.ydata != None:
					print "Absolute coords : ", event.xdata, event.ydata 
					numclicks += 1
					#starting point
					if not annotated:
						pt1[0] = event.xdata/width 
						pt1[1] = event.ydata/height 
						annotated = True
						print "Starting point ", pt1
					#starting direction
					else:
						pt2[0] = event.xdata/width 
						pt2[1] = event.ydata/height 
						dir[0] = pt2[0] - pt1[0]
						dir[1] = pt2[1] - pt1[1]

						#Normalize to unit vector
						norm = math.sqrt(dir[0]*dir[0] + dir[1]*dir[1])
						dir[0] = dir[0]/norm 
						dir[1] = dir[1]/norm 
						print "Dir ", dir 
						annotated = False


			cid = fig.canvas.mpl_connect('button_press_event', onclick)

			plt.show()

			if numclicks == 0 or numclicks % 2 != 0:
				print "Did not specify direction. Not writing to file."

			else:
				coord_file = open(source_dir + file[:-4] + '.txt', 'w')
				coord_str = str(pt1[0]) + " " + str(pt1[1]) + "\n" + str(dir[0]) + " " + str(dir[1])
				print coord_str, source_dir + file[:-4] + '.txt'
				coord_file.write(coord_str)

				coord_file.close()

				print "Starting point and direction written to file: "
				print "Starting point: ", pt1
				print "Direction: ", dir
