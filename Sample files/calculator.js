import { add } from "./math.js";

export function calculateSum(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total = add(total, arr[i]);
  }
  return total;
}

function complexLoop(n) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      console.log(i*j);
    }
  }
}
