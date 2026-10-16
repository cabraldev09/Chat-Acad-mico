import React, { useEffect } from 'react';
import toastError from "../../errors/toastError";

import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";

import { Button, Divider, } from "@material-ui/core";

const LocationPreview = ({ image, link, description }) => {
    useEffect(() => {}, [image, link, description]);

    const handleLocation = async() => {
        try {
            window.open(link);
        } catch (err) {
            toastError(err);
        }
    }

    return (
		<>
			<div style={{
				minWidth: "min(250px, 100%)",
			}}>
				<div>
					<div style={{ float: "left" }}>
						<img src={image} onClick={handleLocation} style={{ width: "100px", maxWidth: "40%", height: "auto" }} />
					</div>
					{ description && (
					<div style={{ display: "flex", flexWrap: "wrap" }}>
						<Typography style={{ marginTop: "12px", marginLeft: "15px", marginRight: "15px", float: "left" }} variant="subtitle1" color="primary" gutterBottom>
							<div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(description).replace(/\\n/g, "\n")}</div>
						</Typography>
					</div>
					)}
					<div style={{ display: "block", content: "", clear: "both" }}></div>
					<div>
						<Divider />
						<Button
							fullWidth
							color="primary"
							onClick={handleLocation}
							disabled={!link}
						>Visualizar</Button>
					</div>
				</div>
			</div>
		</>
	);

};

export default LocationPreview;