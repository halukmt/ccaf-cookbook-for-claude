// Input for the Result-type transformation.
type UserData = { id: string; name: string };

export async function getUserData(userId: string): Promise<UserData> {
  const response = await fetch("/users/" + userId);
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}
