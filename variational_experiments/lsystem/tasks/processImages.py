"""
Resize, binarize, and filter target images.
"""

#from __future__ import division
import numpy as np
import os
import skimage 
import sys
from PIL import Image 
from skimage.filters import threshold_otsu
from scipy.misc import imsave
from skimage.transform import resize
from skimage import measure

def scale(image, max_size, method=Image.ANTIALIAS):
    im_aspect = float(image.size[0])/float(image.size[1])
    out_aspect = float(max_size[0])/float(max_size[1])
    if im_aspect >= out_aspect:
        scaled = image.resize((max_size[0], int((float(max_size[0])/im_aspect) + 0.5)), method)
    else:
        scaled = image.resize((int((float(max_size[1])*im_aspect) + 0.5), max_size[1]), method)
 
    offset = (((max_size[0] - scaled.size[0]) / 2), ((max_size[1] - scaled.size[1]) / 2))
    back = Image.new("L", max_size, "white")
    back.paste(scaled, offset)
    return back

def compute_crop(dim, diff, min_d, max_d, offset):
	#If both within bounds
	if max_d + offset < dim and min_d - offset >= 0:
		max_d += offset
		min_d -= offset
	elif max_d + offset < dim:
		diff2 = offset - min_d 
		max_d += offset + diff2
		min_d = 0
	elif minc - offset >= 0:
		diff2 = max_d + offset - dim
		min_d -= offset
		min_d -= diff2
		max_d = dim - 1

	return min_d, max_d 

def process_phylopic():
	input_dir = "../targets/phylopic_new/"
	output_dir = "../targets/phylopic_processed_new/"
	filelist = os.listdir(input_dir)

	for file in filelist:
		#print file[-4:]
		if file[-4:] == '.png':
			print file 
			#Open image
			img = Image.open(input_dir + file)
			img.load() # required for png.split()

			background = Image.new("RGB", img.size, (255, 255, 255))
			background.paste(img, mask=img.split()[3]) # 3 is the alpha channel
			background = background.convert('L')

			new_size = (600, 600)
			scaled_img = scale(background, new_size)

			#binarized_img = scaled_img.point(lambda x: 0 if x<128 else 255, '1')
			scaled_img.save(output_dir + "phylopic_" + file[:-13] + '.png', "PNG")

#Convert glyph grid to individual binarized and resized 100x100 images
#Only keep those with 500 foreground pixels and only one foreground connected component
def process_font():
	input_img = "../targets/script_font/font_rend.png"
	output_img = "../targets/script_font/glyph_" 
	img = Image.open(input_img).convert('L')
	img_arr = np.array(img)
	ncols = img_arr.shape[1]
	
	#Delete whitespace at the end
	last = np.arange(ncols-9, ncols)
	img_arr = np.delete(img_arr, last, 1)

	#Glyph grid is 61x12

	step = int(img_arr.shape[0]/61)

	indices = np.arange(0, img_arr.shape[0], step)
	indices = indices[:-1]
	indices = indices[1:]
	print indices

	#Split into subimages
	subarrays = np.split(img_arr, 12, 1)
	subarr_ind = 0	
	for subarr in subarrays:
		
		subsubarrays = np.split(subarr[:-1], indices, 0)
		subsubarr_ind = 0
		
		for subsubarr in subsubarrays:
			#Remove whitespace from top and bottom, resize
			resized = subsubarr[15:115, :]
			resized = resize(resized, (100, 100))			

			dims = resized.shape 

			#Binarizes
			thresh = threshold_otsu(resized)
			binarized = (resized > thresh).astype(float)
			binarized = binarized*255

			#Check number of connected components
			labels = measure.label(binarized)

			min_area_size = sys.maxint 
			foreground = None

			#Get smaller region
			for region in measure.regionprops(labels):
				#print region 
				if region.area < min_area_size:
					min_area_size = region.area
					foreground = region 

			#Get min bounding rect
			minr, minc, maxr, maxc = foreground.bbox

			pad = 2 #2 pixel padding on all sides

			#Convert to min bounding square
			row_diff = maxr - minr
			col_diff = maxc - minc
			offset_r = 0
			offset_c = 0 
			diff = np.abs(row_diff - col_diff)
			
			if diff%2 == 0:
				offset_r = diff/2
				offset_c = diff/2
			else:
				offset_r = (diff-1)/2
				offset_c = offset_r + 1

			if row_diff > col_diff:
				minc, maxc = compute_crop(dims[1], diff, minc, maxc, offset_c)

			elif col_diff > row_diff:
				minr, maxr = compute_crop(dims[0], diff, minr, maxr, offset_r)


			#Check total number of foreground pixels
			bc = np.bincount(binarized.astype(int).flatten())

			resized = resized*255

			if len(np.unique(labels)) == 2 and bc[0] > 500:
				#Crop
				cropped = resized[max(minr-pad, 0):min(maxr+pad, dims[0]), max(0,minc-pad):min(maxc+pad, dims[1])]

				img_back = Image.fromarray(cropped).convert('L')
				img_back.save(output_img + str(subarr_ind) + "_" + str(subsubarr_ind) + ".png")

			
			subsubarr_ind += 1

		subarr_ind +=1

if __name__ == "__main__": 
	process_font()