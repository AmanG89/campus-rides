import "./main.css"
export default function Footer(){
    
    return(<div className="footer">
   <h1 style={{textAlign:'center'}}>How It Works</h1>
   < div className="items">
   <h3><img src={magnifyingGlass} alt="Discover Trips"/>Discover Trips<p>Browse trips organized by students from your university or nearby.</p> </h3>
    <h3><img src={user} alt="Create Trip"/>join or Create<p>Join existing trips or create your own and invite fellow students.</p></h3>
    <h3><img src={location} alt="user"/>Travel Together<p>Enjoy amazing experiences while saving money through group bookings</p></h3>
    </div>
    </div>)
}