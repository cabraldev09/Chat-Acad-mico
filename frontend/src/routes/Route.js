import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

// adminOnly: administration pages. Anyone else who types the address goes back to the home page
// instead of seeing a wall of "no permission" errors.
const Route = ({ component: Component, isPrivate = false, adminOnly = false, ...rest }) => {
  const { isAuth, loading, user } = useContext(AuthContext);

  // decided inside the matching route: every Route is rendered on every page, only the one for the open address may redirect
  const blocked = isAuth && adminOnly && !loading && user && user.profile && user.profile !== "admin";

  if (!isAuth && isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/login", state: { from: rest.location } }} />
      </>
    );
  }

  if (isAuth && !isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/", state: { from: rest.location } }} />;
      </>
    );
  }

  return (
    <>
      {loading && <BackdropLoading />}
      <RouterRoute {...rest} render={(props) => (blocked ? <Redirect to="/" /> : <Component {...props} />)} />
    </>
  );
};

export default Route;
