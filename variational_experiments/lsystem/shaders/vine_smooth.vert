uniform mat3 viewMat;

attribute vec2 inPos;

float freq = 2.;
float amp = 0.01;
// float amp = 0.0;

void main(void) {
	vec2 ndcpos = (viewMat * vec3(inPos, 1.)).xy;
	gl_Position = vec4(ndcpos, 0., 1.);
}