import React, { useContext } from "react";
import { Redirect } from "react-router-dom";

import { AuthContext } from "../../context/Auth/AuthContext";
import { hubHome } from "../../components/StatsHub";

// /estatisticas opens the first page of the hub the person can see (the manager: the commercial management)
export default function Statistics() {
  const { user } = useContext(AuthContext);
  return <Redirect to={hubHome(user)} />;
}
