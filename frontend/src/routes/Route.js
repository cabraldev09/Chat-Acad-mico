import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import { isManager } from "../utils/access";

// adminOnly: administration pages. Anyone else who types the address goes back to the home page
// instead of seeing a wall of "no permission" errors.
const Route = ({ component: Component, isPrivate = false, adminOnly = false, managerOnly = false, salesOnly = false, academicOnly = false, afterSalesOnly = false, publicPage = false, ...rest }) => {
  const { isAuth, loading, user } = useContext(AuthContext);

  // decided inside the matching route: every Route is rendered on every page, only the one for the open address may redirect
  // a page for people without an account (the affiliate portal): open to everyone, whether or not there is a session
  if (publicPage) return <RouterRoute {...rest} render={(props) => <Component {...props} />} />;

  // adminOnly: administrator alone; managerOnly: administrator or coordinator
  const blocked =
    isAuth && !loading && user && user.profile &&
    ((adminOnly && !isManager(user)) || (managerOnly && !isManager(user)) || (salesOnly && !isManager(user) && user.role !== "consultor") || (academicOnly && !isManager(user) && user.role !== "tutor") || (afterSalesOnly && !isManager(user) && user.role !== "tutor" && user.role !== "relacionamento"));

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
