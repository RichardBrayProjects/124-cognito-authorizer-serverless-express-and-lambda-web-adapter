import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch, API_BASE_URL } from "@/api";

export default () => {
  const { user, setUser, login, logout } = useAuth();
  const navigate = useNavigate();

  const logoutUser = async () => {
    await logout();
    setUser(null); 
    navigate('/', { replace: true });
  };

  const testProfileEndpoint = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/v1/profile`);
      const data = await response.json();
      console.log('Profile endpoint response:', data);
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
    } catch (error) {
      console.error('Error calling /v1/profile:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Profile Page</h1>
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            {!user ? (
              <p className="text-muted-foreground">
                Click below to log in with Cognito.
              </p>
            ) : (
              <p>
                You are logged in as{" "}
                <strong>{user.name || user.email || "User"}</strong>.
              </p>
            )}
          </CardContent>
        </Card>
        {user && (
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-left wrap-break-word">
              <p className="text-muted-foreground">
                <span className="font-medium">Name:</span> {user.name || "N/A"}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium">Email:</span>{" "}
                {user.email || "N/A"}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium">Subject:</span>{" "}
                {user.sub || "N/A"}
              </p>
              {user.groups?.length ? (
                <p className="text-muted-foreground">
                  <span className="font-medium">Groups:</span>{" "}
                  {user.groups.join(", ")}
                </p>
              ) : null}
              {user.email_verified !== null && (
                <p className="text-muted-foreground">
                  <span className="font-medium">Email Verified:</span>{" "}
                  {user.email_verified ? "Yes" : "No"}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              "Notification preferences",
              "Privacy settings",
              "Account security",
            ].map((setting) => (
              <div key={setting} className="flex items-center justify-between">
                <span className="text-muted-foreground">{setting}</span>
                <Button variant="link">Edit</Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="text-center space-x-4">
          {user && (
            <Button onClick={testProfileEndpoint} variant="outline">
              Test /v1/profile Endpoint
            </Button>
          )}
          <Button onClick={() => (user ? logoutUser() : login())}>
            {user ? "Logout" : "Login"}
          </Button>
        </div>
      </div>
    </div>
  );
};
