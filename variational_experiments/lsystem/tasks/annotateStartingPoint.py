from __future__ import division 
import matplotlib.pyplot as plt
import os
import sys 
import argparse 

"""
Displays each image in targets/source, records coordinates of mouseclick, 
saves normalized coordinates for each image file to targets/source/file.txt.
Close window to advance to the next image. 

Usage: annotateStarting.py --file [file] --startX [startX] --startY [startY]. If file is given then 
only file will be annotated, otherwise will loop through all images in targets/source. 

If startX and startY are given then text files for all images (or, if --file is specified, only one image)
will be generated with the same starting point, without manual annotation. 

"""
source_dir = '../targets/source/'
ext = '.png'

def onclick(event):
	if event.xdata != None and event.ydata != None:
		print event.xdata, event.ydata 
		normalized_x = event.xdata/width 
		normalized_y = event.ydata/height 
		coord_file = open(source_dir + file[:-4] + '.txt', 'w')
		coord_file.write(str(normalized_x) + " " + str(normalized_y))

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

			cid = fig.canvas.mpl_connect('button_press_event', onclick)

			plt.show()
