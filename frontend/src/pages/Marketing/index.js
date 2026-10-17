import React, { useState } from "react";
import { Tab, Tabs, makeStyles } from "@material-ui/core";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import Cac from "./Cac";
import CoursePages from "./CoursePages";

const useStyles = makeStyles((theme) => ({
  body: { flex: 1, overflowY: "auto", overflowX: "hidden", ...theme.scrollbarStyles, paddingBottom: theme.spacing(4) },
  wrap: { maxWidth: 980, margin: "0 auto" },
}));

// Marketing: what it costs to attract a student (by source and campaign), and the page of each course for the site and the ads.
const Marketing = () => {
  const classes = useStyles();
  const [tab, setTab] = useState(0);
  return (
    <MainContainer>
      <MainHeader><Title>Marketing</Title></MainHeader>
      <div className={classes.body}>
        <div className={classes.wrap}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} indicatorColor="primary" textColor="primary" style={{ marginBottom: 16 }}>
            <Tab label="Custo por origem" />
            <Tab label="Páginas por curso" />
          </Tabs>
          {tab === 0 && <Cac />}
          {tab === 1 && <CoursePages />}
        </div>
      </div>
    </MainContainer>
  );
};

export default Marketing;
