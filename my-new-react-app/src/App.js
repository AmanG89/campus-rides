
import './App.css';
import Navbar from './component/navbar/navbar.jsx';
import Main from './component/main.jsx/main.jsx';
import React from 'react';
import Profile from './component/createtrip/profile.jsx';
import CreateTrip from './component/createtrip/createtrip.jsx';
import Discover from './component/createtrip/discover.jsx';
import Login from './component/createtrip/login.jsx';
import Signup from './component/createtrip/signup.jsx';
import ViewDetails from './component/details/viewdetail.jsx';
 import JoinTrip from './component/details/jointrip.jsx';
 import Chatapp from './component/chatapp/groupchat.jsx';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import UserProfile from "./component/chatapp/UserProfile.jsx";

function AppContent() {
  const location = useLocation();
  const hideNavbarRoutes = ['/', '/signup'];
  return (
    <>
    {!hideNavbarRoutes.includes(location.pathname) && <Navbar />}
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup/>}/>
        <Route path="/home" element={<Main />} />
        <Route path="/viewdetails/:id" element={<ViewDetails />} />
        <Route path="/discover" element={<Discover/>} />
        <Route path="/profile/:id" element={<Profile />} />
        <Route path="/create-trip" element={<CreateTrip/>}/>
        <Route path="/join-trip/:id" element={<JoinTrip  />} />
        <Route path="/chatapp/:tripId" element={<Chatapp/>}/>
        <Route path="/user/:email" element={<UserProfile />} />
      </Routes>
     
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
