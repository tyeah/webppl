if (typeof(window) === 'undefined')  {
	var THREE = require('three');
}

function render(canvas, viewport, branches, starti, endi) {
	if (viewport === undefined)
		viewport = {xmin: 0, ymin: 0, xmax: canvas.width, ymax: canvas.height};

	starti = starti || 0;
	endi = endi || branches.length;

	function world2img(p) {
		return new THREE.Vector2(
			canvas.width * (p.x - viewport.xmin) / (viewport.xmax - viewport.xmin),
			canvas.height * (p.y - viewport.ymin) / (viewport.ymax - viewport.ymin)
		);
	}

	var ctx = canvas.getContext('2d');

	// Fill background
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'white';
	ctx.fill();

	// Draw
	ctx.strokeStyle = 'black';
	ctx.lineCap = 'round';
	for (var i = starti; i < endi; i++) {
		var branch = branches[i];
		var istart = world2img(branch.start);
		var iend = world2img(branch.end);
		var iwidth = branch.width / (viewport.xmax - viewport.xmin) * canvas.width;
		ctx.beginPath();
		ctx.lineWidth = iwidth;
		ctx.moveTo(istart.x, istart.y);
		ctx.lineTo(iend.x, iend.y);
		ctx.stroke();
	}
}

if (typeof(window) === 'undefined') {
	module.exports = {
		render: render
	};
}