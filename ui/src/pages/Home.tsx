import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default () => {
  const { loading } = useAuth();

  if (loading) return <p className="p-4 text-muted-foreground">Loading...</p>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-4">🎨 Uptick Art Gallery</h1>
      <p className="text-muted-foreground text-lg mb-8">
        Welcome to our digital art collection
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Card key={item} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-xl">Artwork {item}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Discover beautiful artwork in our collection.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
