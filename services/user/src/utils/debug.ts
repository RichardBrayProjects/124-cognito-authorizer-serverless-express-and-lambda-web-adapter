// utils/debug.ts
export const debug = (...args: unknown[]) => {
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log(...args);
  }
};
