uniform mat3 viewMat;

attribute vec2 inPos;

void main(void) {
	vec2 ndcpos = (viewMat * vec3(inPos, 1.)).xy;
	gl_Position = vec4(ndcpos, 0., 1.);
}