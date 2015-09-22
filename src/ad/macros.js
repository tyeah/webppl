// precedence and associativity taken from
// http://sweetjs.org/doc/main/sweet.html#custom-operators
operator +   14 { $r } => #{ __AD__.add(0, $r) }
operator -   14 { $r } => #{ __AD__.sub(0, $r) }
operator *   13 left { $l, $r } => #{ __AD__.mul($l, $r) }
operator /   13 left { $l, $r } => #{ __AD__.div($l, $r) }
operator +   12 left { $l, $r } => #{ __AD__.add($l, $r) }
operator -   12 left { $l, $r } => #{ __AD__.sub($l, $r) }
operator <   10 left { $l, $r } => #{ __AD__.lt($l, $r) }
operator <=  10 left { $l, $r } => #{ __AD__.leq($l, $r) }
operator >   10 left { $l, $r } => #{ __AD__.gt($l, $r) }
operator >=  10 left { $l, $r } => #{ __AD__.geq($l, $r) }
operator ==   9 left { $l, $r } => #{ __AD__.eq($l, $r) }
operator !=   9 left { $l, $r } => #{ __AD__.neq($l, $r) }
operator ===  9 left { $l, $r } => #{ __AD__.peq($l, $r) }
operator !==  9 left { $l, $r } => #{ __AD__.pneq($l, $r) }

macro ++ {
  rule { $r } => { $r = $r + 1 }
  rule infix { $l | } => { $l = $l + 1 }
}
macro -- {
  rule { $r } => { $r = $r - 1 }
  rule infix { $l | } => { $l = $l - 1 }
}

macro += {
  rule infix { $var:expr | $exprVal:expr } => { $var = $var + $exprVal }
}
macro -= {
  rule infix { $var:expr | $exprVal:expr } => { $var = $var - $exprVal }
}
macro /= {
  rule infix { $var:expr | $exprVal:expr } => { $var = $var / $exprVal }
}
macro *= {
  rule infix { $var:expr | $exprVal:expr } => { $var = $var * $exprVal }
}

// Replace references to Math.x with __AD__.Math.x
macro Math {
	rule { .$x } => { __AD__.math.$x }
}