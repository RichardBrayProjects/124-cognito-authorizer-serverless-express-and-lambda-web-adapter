import { Routes, Route } from "react-router-dom";
import Header from "@/components/Header";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import Callback from "@/pages/Callback";

export default () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="*"
          element={<p className="p-4 text-muted-foreground">Route Not Found</p>}
        />
      </Routes>
    </main>
  </div>
);
