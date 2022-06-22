const Acebase = require("acebase-server");
const dbname = "dccplms";
const formidable = require("formidable");
const LiveDirectory = require("live-directory");
const path = require("path");
const server = new Acebase.AceBaseServer(dbname, {
    host: "localhost",
    port: 5757,
    authentication: {
        enabled: false,
    },
});

const LiveAssets = new LiveDirectory({
    path: "uploads", // We want to provide the system path to the folder. Avoid using relative paths.
});

server.app.post("/uploads", async (req, res) => {
    try {
        var uploadForm = new formidable.IncomingForm({
            encoding: "utf-8",
            uploadDir: path.join(__dirname, "/uploads"),
            multiples: true,
            keepExtensions: true,
        });
        uploadForm.parse(req, (err, felds, files) => {
            let fileNames = [];
            console.log(files)
            if (Array.isArray(files.files)) {
                fileNames = files.files?.map((f) => f.newFilename);
            } else {
                fileNames = [files.files.newFilename];
            }
            res.setHeader("Access-Control-Allow-Origin", req.header("origin"));
            res.json({
                fileNames,
                success: true,
            });
        });
    } catch (error) {
        console.log(error);
    }
});

server.app.get("/uploads/*", (req, res) => {
    const path = req.path.replace("/uploads", "");
    const file = LiveAssets.get(path);
    // Return a 404 if no asset/file exists on the derived path
    if (file === undefined) return res.status(404).send();

    if (req.header("origin")) {
        res.setHeader("Access-Control-Allow-Origin", req.header("origin"));
    }
    // Set appropriate mime-type and serve file buffer as response body
    return res.type(file.extension).send(file.buffer);
});
server.on("ready", async () => {
    console.log("SERVER ready");
    //check if admin not exists then create one
    let db = server.db;

    if (!(await db.query("users").filter("username", "==", "admin").exists())) {
        db.ref("users").push({
            username: "admin",
            password: "1234",
            role: "Admin",
            first_name: "Default",
            middle_name: "System",
            last_name: "Admin",
        });
    }


    server.extend("post", "assignpoints", async (req, res) => {
        try {
            const { ANSWERS_PATH, id,answers, score } = req.body;
            let newPath = ANSWERS_PATH + "/" + id;
            console.log(score)
            await db.ref(newPath).update({ answers, score });
            res.send("ok");
        } catch (err) {
            console.log(err)
        }
    });

    server.extend("post", "answer",async(req,res)=>{
        try {
            console.log("IM INVOKER!")
            const {student_id, id,path, answers, files } = req.body
            let identifier = "assignment_id";
            let answers_path = "assignment_answers"
            if(path == "examinations"){
                identifier = "examination_id"
                answers_path = "examination_answers"
            }
            if(path == "activities") {
                identifier = "activity_id"
                answers_path = "activity_answers"
            }
            const question_object = await db.ref(path + "/" + id).get()
            console.log("Accessing questionaires from ref: ",path + "/" + id)
            const QUESTION_TYPE = question_object.val()?.type
            const QUESTIONAIRE = question_object.val()?.questionaire
            let data = {
                [identifier]: id,
                student_id
            }
            console.log(answers)
            if(QUESTION_TYPE == "File Only"){
                data.files = files
            }else{
                if(Array.isArray(files) && files.length){
                    data.files = files
                }
                data.answers = answers
                console.log(QUESTIONAIRE)
                for (let i = 0; i < answers.length; i++) {
                    const { answer, questionIndex } = answers[i];
                    if (
                        [
                            "Multiple Choice",
                            "Identification",
                            "True or False",
                        ].includes(QUESTIONAIRE[questionIndex].type)
                    ) {
                        if (
                            QUESTIONAIRE[questionIndex].answer.toLowerCase() ==
                            answer.toLowerCase()
                        ) {
                            answers[i].score = QUESTIONAIRE[questionIndex].points;
                        } else {
                            answers[i].score = 0;
                        }
                    } else {
                        answers[i].score = 0;
                    }
                }
                console.log(data.answers)
                if(data.answers.length > 1){
                    data.score = data.answers.map(a=>a.score).reduce((a,b)=>a+b)
                }else{
                    data.score = data.answers[0].score
                }
            }
            await db.ref(answers_path).push(data)
            console.log("Saved!!")
            res.send("ok")
        } catch (error) {
            console.log(error)
            res.send(error)
        }
    })

    server.extend("post", "examinations/answer", async (req, res) => {
        try {
            const { answers, examination_id, student_id } = req.body;
            //validate answers
            let questions = (
                await db.ref("examinations/" + examination_id).get()
            ).val().questionaire;
            console.log(questions);
            for (let i = 0; i < answers.length; i++) {
                const { answer, questionIndex } = answers[i];
                console.log(answer, questionIndex);
                if (
                    [
                        "Multiple Choice",
                        "Identification",
                        "True or False",
                    ].includes(questions[questionIndex].type)
                ) {
                    if (
                        questions[questionIndex].answer.toLowerCase() ==
                        answer.toLowerCase()
                    ) {
                        answers[i].score = questions[questionIndex].points;
                    } else {
                        answers[i].score = 0;
                    }
                } else {
                    answers[i].score = 0;
                }
            }
            await db.ref("examination_answers").push({
                answers,
                examination_id,
                student_id,
            });
            res.send("ok");
        } catch (error) {
            res.statusCode = 500;
            console.log(error);
            res.send(error);
        }
    });

    server.extend("post", "assignments/answer", async (req, res) => {
        try {
            const { answers, assignment_id, student_id } = req.body;
            //validate answers
            let questions = (
                await db.ref("assignments/" + assignment_id).get()
            ).val().questionaire;
            for (let i = 0; i < answers.length; i++) {
                const { answer, questionIndex } = answers[i];
                if (
                    [
                        "Multiple Choice",
                        "Identification",
                        "True or False",
                    ].includes(questions[questionIndex].type)
                ) {
                    console.log("Corrent answer is:", questions[questionIndex].answer.toLowerCase());
                    console.log("Answer is", answer.toLowerCase())
                    if (
                        questions[questionIndex].answer.toLowerCase() ==
                        answer.toLowerCase()
                    ) {
                        answers[i].score = questions[questionIndex].points;
                    } else {
                        answers[i].score = 0;
                    }
                } else {
                    answers[i].score = 0;
                }
            }
            await db.ref("assignment_answers").push({
                answers,
                assignment_id,
                student_id,
            });
            res.send("ok");
        } catch (error) {
            res.statusCode = 500;
            console.log(error);
            res.send(error);
        }
    });


    server.extend("post", "activities/answer", async (req, res) => {
        try {
            const { answers, activity_id, student_id } = req.body;
            //validate answers
            let questions = (
                await db.ref("activities/" + activity_id).get()
            ).val().questionaire;
            for (let i = 0; i < answers.length; i++) {
                const { answer, questionIndex } = answers[i];
                if (
                    [
                        "Multiple Choice",
                        "Identification",
                        "True or False",
                    ].includes(questions[questionIndex].type)
                ) {
                    console.log("Corrent answer is:", questions[questionIndex].answer.toLowerCase());
                    console.log("Answer is", answer.toLowerCase())
                    if (
                        questions[questionIndex].answer.toLowerCase() ==
                        answer.toLowerCase()
                    ) {
                        answers[i].score = questions[questionIndex].points;
                    } else {
                        answers[i].score = 0;
                    }
                } else {
                    answers[i].score = 0;
                }
            }
            await db.ref("activity_answers").push({
                answers,
                activity_id,
                student_id,
            });
            res.send("ok");
        } catch (error) {
            res.statusCode = 500;
            console.log(error);
            res.send(error);
        }
    });
});
