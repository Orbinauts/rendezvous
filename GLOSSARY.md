# Rendezvous

The detection of one satellite moving onto another's orbit and holding beside it, from the public catalogue's element sets, scored against a ground truth of public rendezvous.

## Language

**Chaser**:
The object that moved onto the other's orbit, named by the move the detector saw (its plane or height changed, or it was new); the other is the target. A pair keeps the chaser it was first watched with.
_Avoid_: inspector, stalker, aggressor (they say intent; the detector says geometry)

**Hold**:
The beside stage: the chaser within 100 km of the target now and a day later with no further manoeuvre. The published verdict; the plane and height stages are its timeline.
_Avoid_: rendezvous (for the stage alone; a rendezvous is the whole case), proximity operation

**Case**:
One row of the ground truth: one chaser and one target, with the stages the sources state and their statements. Several visits of one chaser to one target years apart are several cases.

**Exclusion**:
A reason, read from `data/exclusions.json`, that a pair is not shown: one launch, one owner, a station's visitor, a dispersing stack, a fragment on either side, a duplicate number. A pair of one launch or one owner is never watched; the others are watched and tagged.

**Raised, confirmed, withdrawn**:
A hold or a departure is raised by the first set that shows it, confirmed by the next set that agrees, an hour or more later, and withdrawn where the next set has the pair far apart again, a bad fit.

**Invisible**:
A case whose chaser or target has no public element sets in the scored span, which no detector of public data can see: the United States reconnaissance satellites the Russian inspectors shadowed.
_Avoid_: undetectable (which sounds like the detector's fault)
