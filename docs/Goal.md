# SafetyCar project goal

SafetyCar helps drivers understand where travel on Bulgaria’s national roads is riskier and why. Its interactive map uses crash history and road characteristics to identify long-term hazards and shows how current road events and weather affect travel. Drivers can inspect the evidence for each section and see which restrictions apply to their vehicle. The same evidence helps prioritize road-safety improvements.

## What the project aims to achieve

- Turn crash records, road characteristics, АПИ road events, and weather data into explainable assessments on a shared network of approximately 3 km road sections.
- Help drivers of passenger cars and vehicles over 3.5 tonnes identify current hazards, closures, and vehicle-specific restrictions.
- Give road-safety teams a way to inspect the evidence behind high-risk sections and identify improvements that address the documented hazards.

The first release covers risk assessment, the interactive map, and evidence-backed improvement proposals. Route comparison and automatic rerouting are follow-on work.

## Acceptance criteria

1. **Use a shared 3 km road network.** Calculate baseline risk and assess live АПИ events on the same approximately 3 km sections across the imported motorways and class I, II, and III roads. Sections at the end of a road fragment may be shorter. In a sample from each road class, verify that the historical crash data, road characteristics, live events, and map use the same section ID and geometry. Calculate baseline risk from the underlying data for each section. Each section has a road reference and length, divided carriageways are identifiable, and distances along OpenStreetMap geometry are labeled accordingly.

2. **Calculate baseline risk from real data.** Combine a reactive assessment of crashes involving injury or death with a proactive assessment of road characteristics. Show the evidence, data period, and any missing or estimated inputs. Reproduce the scores for sample sections from the underlying data. Verify that multiple people involved in one crash count as one crash and that sparse evidence is flagged as uncertain.

3. **Show current road hazards by vehicle class.** Rank active АПИ events by severity and report closures and restrictions for passenger cars and vehicles over 3.5 tonnes. In a test with a restriction based only on mass and applying to vehicles over 12 tonnes, verify that the restriction is excluded for passenger cars and a vehicle of exactly 12 tonnes, applies at 18 tonnes, and is conditional when the heavy vehicle’s mass is unspecified. Also verify that a full closure is shown, future and expired events are excluded from current risk, and a stale feed yields an unknown current status.

4. **Explain weather-related risk.** Show current weather hazards wherever data is available. Verify that a historical risk multiplier is applied in a scenario with sufficient evidence and remains neutral in a scenario with insufficient evidence. Missing or stale weather data is visible to the user.

5. **Deliver an interactive, data-backed map.** On desktop and mobile, users can pan, zoom, select a road section, and switch between the two vehicle classes. In both Bulgarian and English, open a real section and verify that the map shows its baseline risk, current conditions, contributing factors, restrictions, and update time. Label any sample data where it is displayed.

6. **Validate the ranking and explain improvements.** Rank the eligible sections using 2021–2023 data. Report the share of geolocated 2024 fatal crashes that fell in the highest-risk 10% of those sections. Document coverage limits and show an evidence-backed improvement proposal for a sample high-priority section.

7. **Make the release reproducible.** Document the required data inputs, database setup, browser build, and live refresh process. A teammate can follow the instructions to load the data, build the app, and verify one historical result and one live restriction from source to map.

## Project references

- [Road assessment guidelines](../RoadEvalGuidelines.docx)
- [Data aggregation and historical validation plan](data-aggregation.md)
- [PostGIS data pipeline and API](database.md)
- [Live road-event queries](road-status.md)
- [Current weather and traffic data plan](realtime-data.md)
