"""
Iterate through images in source directory, add filenames meeting a condition to images.txt file.

Usage: addImages.py --outputDir dir --endStr str, adds image filenames in targets/source 
which end with str to targets/dataset/dir/images.txt. 

"""
import os
import argparse 

source_dir = '../targets/source/'
dataset_dir = '../targets/datasets/'

parser = argparse.ArgumentParser()
parser.add_argument('--outputDir')
parser.add_argument('--endStr')
args = parser.parse_args()

filelist = os.listdir(source_dir)
imagelist = ''

if not os.path.exists(dataset_dir + args.outputDir):
    os.makedirs(dataset_dir + args.outputDir)

for file in filelist:
	if file.startswith(args.endStr): 
		imagelist += file + '\n'

image_file = open(dataset_dir + args.outputDir + '/images.txt', 'w')
image_file.write(imagelist)
	