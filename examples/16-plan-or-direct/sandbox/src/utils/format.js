// displayName is called from the unauthenticated route with no user.
export function displayName(user) {
  return user.name.trim();
}

export const money = (cents) => (cents / 100).toFixed(2);
