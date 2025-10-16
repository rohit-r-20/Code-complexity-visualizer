export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}

export function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function helperSquare(x) {
  return x * x;
}
