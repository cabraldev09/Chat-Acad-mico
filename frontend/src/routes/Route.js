import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

// adminOnly: administration pages. Anyone else who types the address goes back to the home page
// instead of seeing a wall of "no permission" errors.
const Route = ({ component: Component, isPrivate = false, adminOnly = false, ...rest }) => {
  const { isAuth, loading, user } = useContext(AuthContext);

  if (isAuth && adminOnly && !loading && user && user.profile && user.profile !== "admin") {
    return <Redirect to="/" />;
  }

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
      <RouterRoute {...rest} component={Component} />
    </>
  );
};

export default Route;
