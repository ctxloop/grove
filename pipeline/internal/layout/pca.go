package layout

import "math"

// project2D standardizes each column of rows (mean 0, standard deviation 1;
// constant columns become 0) and projects every row onto the first two
// principal components. Components come from the covariance matrix by power
// iteration with deflation, starting from a fixed vector, and each one's sign
// is fixed so its largest entry is positive. The output is deterministic.
func project2D(rows [][]float64) []vec {
	n := len(rows)
	if n == 0 {
		return nil
	}
	d := len(rows[0])
	z := standardize(rows)
	cov := make([][]float64, d)
	for a := range cov {
		cov[a] = make([]float64, d)
	}
	for _, r := range z {
		for a := 0; a < d; a++ {
			for b := a; b < d; b++ {
				cov[a][b] += r[a] * r[b]
			}
		}
	}
	for a := 0; a < d; a++ {
		for b := a; b < d; b++ {
			cov[a][b] /= float64(n)
			cov[b][a] = cov[a][b]
		}
	}
	pc1, l1 := principal(cov)
	for a := 0; a < d; a++ {
		for b := 0; b < d; b++ {
			cov[a][b] -= l1 * pc1[a] * pc1[b]
		}
	}
	pc2, _ := principal(cov)
	out := make([]vec, n)
	for i, r := range z {
		out[i] = vec{dot(r, pc1), dot(r, pc2)}
	}
	return out
}

func standardize(rows [][]float64) [][]float64 {
	n, d := len(rows), len(rows[0])
	mean := make([]float64, d)
	for _, r := range rows {
		for j, v := range r {
			mean[j] += v
		}
	}
	for j := range mean {
		mean[j] /= float64(n)
	}
	sd := make([]float64, d)
	for _, r := range rows {
		for j, v := range r {
			sd[j] += (v - mean[j]) * (v - mean[j])
		}
	}
	for j := range sd {
		sd[j] = math.Sqrt(sd[j] / float64(n))
	}
	z := make([][]float64, n)
	for i, r := range rows {
		z[i] = make([]float64, d)
		for j, v := range r {
			if sd[j] > 1e-12 {
				z[i][j] = (v - mean[j]) / sd[j]
			}
		}
	}
	return z
}

// principal returns the dominant eigenvector (unit length) and eigenvalue of
// a symmetric positive semi-definite matrix. A zero matrix gives a zero
// vector.
func principal(m [][]float64) ([]float64, float64) {
	d := len(m)
	v := make([]float64, d)
	for i := range v {
		v[i] = float64(i + 1) // fixed start, not orthogonal to typical components
	}
	normalize(v)
	next := make([]float64, d)
	lambda := 0.0
	for it := 0; it < 1000; it++ {
		for a := 0; a < d; a++ {
			next[a] = dot(m[a], v)
		}
		lambda = math.Sqrt(dot(next, next))
		if lambda < 1e-12 {
			return make([]float64, d), 0
		}
		for a := range next {
			next[a] /= lambda
		}
		diff := 0.0
		for a := range v {
			diff = math.Max(diff, math.Abs(next[a]-v[a]))
		}
		copy(v, next)
		if diff < 1e-12 {
			break
		}
	}
	big := 0
	for a := range v {
		if math.Abs(v[a]) > math.Abs(v[big]) {
			big = a
		}
	}
	if v[big] < 0 {
		for a := range v {
			v[a] = -v[a]
		}
	}
	return v, lambda
}

func normalize(v []float64) {
	l := math.Sqrt(dot(v, v))
	for i := range v {
		v[i] /= l
	}
}

func dot(a, b []float64) float64 {
	s := 0.0
	for i := range a {
		s += a[i] * b[i]
	}
	return s
}
