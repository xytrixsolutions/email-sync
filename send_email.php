
<?php

session_start(); // Start the session

// Load Composer's autoloader (if using PHPMailer via Composer)
// require 'vendor/autoload.php';

// PHPMailer - If not using Composer, include the files manually
require 'PHPMailer/PHPMailer.php';
require 'PHPMailer/SMTP.php';
require 'PHPMailer/Exception.php';

// Import PHPMailer classes into the global namespace
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Get form data
    $vehicle_model = htmlspecialchars($_POST['vehicle_model']);
    $vehicle_reg = htmlspecialchars($_POST['vehicle_reg']);
    $vehicle_brand = htmlspecialchars($_POST['vehicle_brand']);
    $vehicle_title = htmlspecialchars($_POST['vehicle_title']);
    $vehicle_vrm = htmlspecialchars($_POST['vehicle_vrm']);
    $vehicle_series = htmlspecialchars($_POST['vehicle_series']);
    $vehicle_part = htmlspecialchars($_POST['vehicle_part']);
    $engine_capacity = htmlspecialchars($_POST['engin_capacity']);
    $fuel_type = htmlspecialchars($_POST['fuelType']);
    $part_supplied = htmlspecialchars($_POST['part_supplied']);
    $supply_only = htmlspecialchars($_POST['supply_only']);
    $consider_both = htmlspecialchars($_POST['consider_both']);
    $reconditioned_condition = htmlspecialchars($_POST['reconditioned_condition']);
    $used_condition = htmlspecialchars($_POST['used_condition']);
    $new_condition = htmlspecialchars($_POST['new_condition']);
    $consider_all_condition = htmlspecialchars($_POST['consider_all_condition']);
    $postcode = htmlspecialchars($_POST['postcode']);
    $vehicle_drive = htmlspecialchars($_POST['vehicle_drive']);
    $collection_required = htmlspecialchars($_POST['collection_required']);
    $email = htmlspecialchars($_POST['email']);
    $name = htmlspecialchars($_POST['name']);
    $number = htmlspecialchars($_POST['number']);
    $description = htmlspecialchars($_POST['description']);
    $engineCode = htmlspecialchars($_POST['engine_code']);

    // Create an instance of PHPMailer
    $mail = new PHPMailer(true);

    try {
        // $mail->isSMTP();
        // $mail->Host       = 'smtp.hostinger.com';             
        // $mail->SMTPAuth   = true;                               
        // $mail->Username   = 'info@capstone.devlabra.com';        
        // $mail->Password   = 'Info@capstone.devlabra.com123';    
        // $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;         
        // $mail->Port       = 465;  
        // $mail->setFrom('info@capstone.devlabra.com', 'Engine Finder');
        // $mail->addAddress('enginefinders@gmail.com');
        // $mail->addAddress('Aft_ms@hotmail.com');
        
        $mail->isSMTP();
        $mail->Host       = 'smtp.gmail.com';             
        $mail->SMTPAuth   = true;                               
        $mail->Username   = 'ef2crm@gmail.com';        
        $mail->Password   = 'ruwn booc nooe nxtw';    
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;         
        $mail->Port       = 465;  
        $mail->setFrom('ef2crm@gmail.com', 'Engine Finders Inquiry');
        $mail->addAddress('ef2crm@gmail.com');
        // Content
        $mail->isHTML(true);
        $mail->Subject = 'New Quote Request - enginefinders.co.uk';
        $mail->Body = <<<EOD
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quote Request</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .container {
            max-width: 600px;
            margin: auto;
            padding: 20px;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        h1 {
            color: #0056b3;
        }
        p {
            margin: 10px 0;
        }
        .label {
            font-weight: bold;
        }
    </style>
</head>
<body>

<!-- 
    <div class="loader-div">
      <div class="loader"></div>
  </div> -->
        
    <div id="home-page">
    <div class="container">
        <h1>New Quote Request</h1>
        <span class="label">Name:</span>
        <span>{$name}</span><br />

        <span class="label">Email:</span>
        <span>{$email}</span><br />

        <span class="label">Phone:</span>
        <span>{$number}</span><br />

        <span class="label" id="make">Make:</span>
        <span class="mailInfo">{$vehicle_brand}</span><br />
        
        <span class="label">Model:</span>
        <span>{$vehicle_series}</span><br />
        
        <span class="label">VRM:</span>
        <span style="text-transform: uppercase">{$vehicle_vrm}</span> <br />
        
        <span class="label">Fuel Type:</span>
        <span class="mailInfo">{$fuel_type}</span><br />
        
        <span class="label">Engine Title :</span>
        <span class="mailInfo">{$vehicle_title}</span><br />
        
        <span class="label">Postcode :</span>
        <span style="text-transform: uppercase;" >{$postcode}</span><br />


        <span class="label">Engine Size:</span>
        <span>{$engine_capacity}.0L</span><br />
        
        <span class="label">Year:</span>
        <span>{$vehicle_reg}</span> <br />
    <span class="label">Additional Note:</span>
    <span>{$description}</span>

        <hr />
        <span class="label">Vehicle Part:</span>
        <span>{$vehicle_part}</span><br />
    <span class="label">Part Supplied:</span>
    <span class="mailInfo">{$part_supplied}</span><br />


    <span class="label">Supply Only:</span>
    <span class="mailInfo">{$supply_only}</span><br />


    <span class="label">Part Condition:</span>
    <span class="mailInfo">{$consider_both}</span><br />


    <span class="label">Condition:</span>
    <span class="mailInfo">{$reconditioned_condition}</span><br />

    <span class="label">Vehicle Drive:</span>
    <span class="mailInfo">{$vehicle_drive}</span><br />

    <span class="label">Used Condition:</span>
    <span class="mailInfo">{$used_condition}</span><br />


    <span class="label">New Condition:</span>
    <span class="mailInfo">{$new_condition}</span><br />


    <span class="label">Consider All Conditions:</span>
    <span class="mailInfo">{$consider_all_condition}</span><br />

    <span class="label">Collection Required:</span>
    <span class="mailInfo">{$collection_required}</span><br />
    <span class="label">Engine Code:</span>
    <span class="mailInfo">{$engineCode}</span><br />

</div>
    <script>
        window.addEventListener("load", () => {
    const loader = document.querySelector(".loader");

    // After 2 seconds, hide the loader and show the home page
    setTimeout(() => {
        loader.classList.add("loader-hidden"); // Hide the loader
    }, 1000); // Delay for 2 seconds

    // Once the transition ends, remove the loader element
    loader.addEventListener("transitionend", () => {
        loader.remove(); // Remove the loader from the DOM
        document.getElementById("home-page").style.display = 'block'; // Show the content
    });    
    const el = document.getElementsByClassName("mailInfo");
    el.forEach((e)=>{e.textContent = e.textContent
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());})
});




    </script>
</body>
</html>
EOD;

        // Send email
        $mail->send();
        $status = 'success';
        $msg = 'Message has been sent successfully.';
        
    } catch (Exception $e) {
        $status = 'error';
        $msg = "Message could not be sent. Mailer Error: {$mail->ErrorInfo}";
    }

    // Set a cookie to indicate message has been shown
    setcookie('form_message_status', $status, time() + 10, '/'); // 10 seconds expiration
    
    // Redirect with query parameters
    header("Location: /");
    exit();
}
?>
